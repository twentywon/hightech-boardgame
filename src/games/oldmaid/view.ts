import * as T from "three";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { DeckView, type CardPose } from "../deck/view";
import { rankOf } from "../deck/cards";
import { JOKER, source, type State } from "./rules";
import { OLDMAID as L, seatSpot } from "./layout";

export const OLDMAID_COLORS: [string, string] = ["#c8321f", "#22355c"];
/** My hand in order of rank, the joker at the end. */
export const mineSorted = (hand: number[]) => [...hand].sort((a, b) => (a === JOKER ? 99 : rankOf(a) * 4 + (a % 4)) - (b === JOKER ? 99 : rankOf(b) * 4 + (b % 4)));
/** Three seats round the green table: my hand along the near edge, two computers' fans across, the pairs laid down in the middle. */
export class OldMaidView extends DeckView<State> {
  private frames: T.Mesh[] = [];
  private cursor: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, 53);
    for (let i = 0; i < 20; i++) {
      const frame = new T.Mesh(this.own(new T.PlaneGeometry(0.84, 1.2)), this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.9, depthWrite: false })));
      frame.rotation.x = -Math.PI / 2;
      frame.visible = false;
      this.frames.push(frame);
      this.scene.add(frame);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.5, 0.58, "#ffffff");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject(): TableSubject {
    return L.SUBJECT;
  }
  /** The order a seat's cards are shown in: mine by rank, the others as they are held. */
  private order(s: State, seat: number) {
    return seat === 0 ? mineSorted(s.hands[0]) : s.hands[seat];
  }
  protected arrange(s: State) {
    const poses = new Map<number, CardPose>(),
      over = s.winner !== null;
    for (let seat = 0; seat < 3; seat++) {
      const cards = this.order(s, seat);
      cards.forEach((id, i) => {
        const p = seatSpot(seat, i, cards.length);
        poses.set(id, { ...p, y: 0.04 + i * 0.003, up: seat === 0 || over, s: seat === 0 ? 1 : 0.82 });
      });
    }
    // Pairs laid down: two by two in a loose heap in the middle.
    s.pairs.forEach((id, i) => {
      const pair = Math.floor(i / 2);
      poses.set(id, { x: Math.sin(pair * 2.1) * 0.9 + (i % 2) * 0.25, y: 0.04 + i * 0.006, z: Math.cos(pair * 1.3) * 0.55 - 0.2, up: true, turn: Math.sin(pair * 1.7) * 0.6, s: 0.8 });
    });
    return poses;
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s || s.winner !== null || s.seat !== 0) return [];
    const from = source(s, 0),
      cards = this.order(s, from);
    return cards.map((id, i) => ({ ...seatSpot(from, i, cards.length), y: 0.05, r: 0.3, point: id }));
  }
  protected animate(before: State, s: State) {
    if (s.ply !== before.ply + 1) return false;
    const card = s.last?.card ?? -1,
      laid = s.last?.laid ?? [];
    return this.shift(before, s, (id) => (id === card ? 0 : laid.includes(id) ? 1 : 2), 260);
  }
  protected mark(marks: Marks) {
    const s = this.state,
      lit = s && s.seat === 0 && s.winner === null && !this.animating ? this.order(s, source(s, 0)) : [];
    this.frames.forEach((frame, i) => {
      const pose = lit[i] !== undefined ? this.poses.get(lit[i]) : undefined;
      frame.visible = !!pose;
      if (pose) {
        frame.position.set(pose.x, pose.y - 0.012, pose.z);
        frame.scale.setScalar(pose.s ?? 1);
      }
    });
    const pose = marks.cursor !== null ? this.poses.get(marks.cursor) : undefined;
    this.cursor.visible = !!pose;
    if (pose) this.cursor.position.set(pose.x, 0.03, pose.z + 0.75);
  }
}
