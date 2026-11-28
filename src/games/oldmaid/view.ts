import * as T from "three";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { DeckView, type CardPose } from "../deck/view";
import { rankOf } from "../deck/cards";
import { classroom } from "../../engine/scenery";
import { capturing } from "../../ui/banner";
import { JOKER, SEATS, source, type State } from "./rules";
import { OLDMAID as L, fanCard, fanSpot, holdOf, rightOf, type Hold } from "./layout";

export const OLDMAID_COLORS: [string, string] = ["#c8321f", "#22355c"];
/** My hand in order of rank, the joker at the end. */
export const mineSorted = (hand: number[]) => [...hand].sort((a, b) => (a === JOKER ? 99 : rankOf(a) * 4 + (a % 4)) - (b === JOKER ? 99 : rankOf(b) * 4 + (b % 4)));
const UP = new T.Vector3(0, 1, 0),
  /** The bones of a computer's arm. */
  UPPER = 2.9,
  FORE = 2.9;
/** Where a fan's hands are: its point, and its turn (x the holder's right, y the fan's upward way, z toward the holder). */
interface Grip {
  at: T.Vector3;
  q: T.Quaternion;
}
const frameOf = (hold: Hold): Grip => ({
  at: hold.pivot.clone(),
  q: new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(rightOf(hold), hold.u, hold.n)),
});
/** A computer that holds no cards any more rests its hands on the desk before it. */
function resting(seat: number): Grip {
  const s = L.SEATS[seat],
    forward = new T.Vector3(s.fx, 0, s.fz),
    right = new T.Vector3().crossVectors(forward, UP);
  return { at: new T.Vector3(s.x + s.fx * 3.0, 0.3, s.z + s.fz * 3.0), q: new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right, forward, UP)) };
}
/** The students who play with me: the colour of their hair and clothes, and how their hair is done. */
const STUDENTS = [
  null,
  { hair: "#2a1d16", skin: "#f1c9a5", style: "short", glasses: false },
  { hair: "#3a2416", skin: "#f3cfae", style: "long", glasses: false },
  { hair: "#1a1714", skin: "#e8bb93", style: "short", glasses: true },
] as const;
/**
 * Old Maid in the first person, in a classroom (the user asked): four desks pushed together, three students holding
 * their cards in fans before them, and my own fan held up in my hands at the bottom of the view, faces toward me.
 * The one whose cards are being drawn holds them out to the one who draws; the pairs are laid in the middle.
 */
export class OldMaidView extends DeckView<State> {
  private frames: T.Mesh[] = [];
  private cursor: T.Mesh;
  /** Each seat's hands, in the frame of the fan they hold. */
  private grips: T.Group[] = [];
  private arms: { seat: number; side: number; shoulder: T.Vector3; upper: T.Mesh; fore: T.Mesh; elbow: T.Mesh }[] = [];
  private held: Grip[] = [];
  /** `net`: over Wi-Fi, where the cards out of my sight are blind ones (`deck/blind.ts`). */
  constructor(host: HTMLElement, quality: "high" | "low", net = false) {
    super(host, quality, 53, false, net);
    this.renderer.setClearColor("#ece6d6");
    // Daylight from the windows at the left, and the room's even light from above.
    this.scene.add(new T.HemisphereLight("#fffaf0", "#8a7660", 1.7));
    const sun = new T.DirectionalLight("#fff0d6", 2.1);
    sun.position.set(-16, 18, 6);
    sun.target.position.set(0, 0, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -14;
    sun.shadow.camera.right = sun.shadow.camera.top = 14;
    sun.shadow.camera.far = 60;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    const fill = new T.DirectionalLight("#ffffff", 0.5);
    fill.position.set(4, 20, 10);
    this.scene.add(fill);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    classroom(this.scene, own, L.HALF_X, L.HALF_Z, L.SEATS);
    for (let seat = 0; seat < SEATS; seat++) {
      const grip = new T.Group();
      this.grips.push(grip);
      this.scene.add(grip);
      this.held.push(resting(seat));
      if (seat === 0) this.myHands(grip);
      else this.student(seat, grip);
    }
    const frame = own(new T.PlaneGeometry(0.84, 1.2).rotateX(-Math.PI / 2)),
      gold = own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide }));
    for (let i = 0; i < 20; i++) {
      const mesh = new T.Mesh(frame, gold);
      mesh.visible = false;
      this.frames.push(mesh);
      this.scene.add(mesh);
    }
    this.cursor = ringMesh(own, 0.16, 0.22, "#ffffff");
    this.cursor.material = own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthTest: false, side: T.DoubleSide }));
    this.cursor.renderOrder = 10;
    this.scene.add(this.cursor);
    this.begin();
  }
  /** A part of a figure, owning its geometry. */
  private part(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) {
    const mesh = new T.Mesh(this.own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** A student in a navy school blazer, sitting at its side of the desks, both hands on the fan it holds. */
  private student(seat: number, grip: T.Group) {
    const look = STUDENTS[seat]!,
      at = L.SEATS[seat],
      body = new T.Group(),
      blazer = this.standard({ color: "#1f2a44", roughness: 0.85 }),
      shirt = this.standard({ color: "#f4f4f0", roughness: 0.8 }),
      tie = this.standard({ color: seat === 2 ? "#b8263a" : "#7a1f2a", roughness: 0.6 }),
      skin = this.standard({ color: look.skin, roughness: 0.65 }),
      hair = this.standard({ color: look.hair, roughness: 0.75 }),
      dark = this.standard({ color: "#1b1715", roughness: 0.4 }),
      blush = this.standard({ color: "#f2a5a0", roughness: 0.8 }),
      part = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number) => this.part(body, g, m, x, y, z);
    part(new T.CapsuleGeometry(1.45, 3.0, 8, 20), blazer, 0, 0.9, 0).scale.set(1, 1, 0.66);
    // The shirt's collar and the tie (a ribbon for the girl) in the opening of the blazer.
    part(new T.ConeGeometry(0.62, 1.3, 3), shirt, 0, 3.3, 0.86).rotation.set(Math.PI, Math.PI / 6, 0);
    if (look.style === "long") {
      for (const side of [-1, 1]) part(new T.ConeGeometry(0.22, 0.5, 8), tie, side * 0.24, 3.55, 1.02).rotation.z = (side * Math.PI) / 2;
      part(new T.SphereGeometry(0.13, 10, 8), tie, 0, 3.55, 1.05);
    } else part(new T.BoxGeometry(0.28, 1.1, 0.1), tie, 0, 3.05, 1.0);
    part(new T.CylinderGeometry(0.42, 0.48, 0.6, 14), skin, 0, 4.05, 0.05);
    part(new T.SphereGeometry(1.12, 28, 20), skin, 0, 5.15, 0.1).scale.set(0.95, 1.02, 0.95);
    // Hair: a cap over the head, longer behind; long hair falls to the shoulders with a fringe over the brow.
    const cap = part(new T.SphereGeometry(1.2, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 5.2, 0.02);
    cap.scale.set(1, 1.04, 1);
    cap.rotation.x = -0.28;
    if (look.style === "long") {
      part(new T.CapsuleGeometry(1.1, 1.4, 6, 16), hair, 0, 4.4, -0.42).scale.set(1.08, 1, 0.55);
      part(new T.BoxGeometry(1.7, 0.42, 0.4), hair, 0, 5.85, 0.95).rotation.x = 0.35;
    } else part(new T.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.3), hair, 0, 5.15, -0.08).scale.set(1.02, 1, 1.02);
    // A face: eyes, cheeks and a small smile; glasses on one.
    for (const side of [-1, 1]) {
      part(new T.SphereGeometry(0.12, 10, 8), dark, side * 0.38, 5.2, 1.06).scale.set(1, 1.25, 0.6);
      part(new T.SphereGeometry(0.17, 10, 8), blush, side * 0.62, 4.88, 0.93).scale.set(1, 0.6, 0.4);
      if (look.glasses) {
        part(new T.TorusGeometry(0.28, 0.035, 6, 20), dark, side * 0.38, 5.2, 1.12);
        part(new T.CylinderGeometry(0.03, 0.03, 0.9, 6).rotateX(Math.PI / 2), dark, side * 0.95, 5.25, 0.7);
      }
    }
    if (look.glasses) part(new T.CylinderGeometry(0.03, 0.03, 0.22, 6).rotateZ(Math.PI / 2), dark, 0, 5.22, 1.14);
    part(new T.TorusGeometry(0.2, 0.035, 6, 14, Math.PI), dark, 0, 4.72, 1.03).rotation.z = Math.PI;
    body.position.set(at.x, 0, at.z);
    body.rotation.y = Math.atan2(at.fx, at.fz);
    this.scene.add(body);
    // The arms: a sleeve from each shoulder to the elbow and on to the hand, which holds the fan's foot.
    const right = new T.Vector3(at.fx, 0, at.fz).cross(UP);
    for (const side of [-1, 1]) {
      const shoulder = new T.Vector3(at.x, 3.25, at.z).addScaledVector(right, side * 1.45).addScaledVector(new T.Vector3(at.fx, 0, at.fz), 0.2),
        upper = this.part(this.scene, new T.CapsuleGeometry(0.42, UPPER - 0.4, 6, 14), blazer, 0, 0, 0),
        fore = this.part(this.scene, new T.CapsuleGeometry(0.36, FORE - 0.4, 6, 14), blazer, 0, 0, 0),
        elbow = this.part(this.scene, new T.SphereGeometry(0.42, 12, 8), blazer, 0, 0, 0);
      this.part(this.scene, new T.SphereGeometry(0.44, 12, 8), blazer, shoulder.x, shoulder.y, shoulder.z);
      this.arms.push({ seat, side, shoulder, upper, fore, elbow });
      // The hand: a rounded palm with the thumb over the front of the cards.
      const hand = this.part(grip, new T.SphereGeometry(0.34, 14, 10), skin, side * 0.3, -0.12, 0.2);
      hand.scale.set(0.9, 1.15, 0.7);
      this.part(grip, new T.CapsuleGeometry(0.09, 0.3, 4, 8), skin, side * 0.16, 0.12, -0.05).rotation.z = side * 0.6;
    }
  }
  /** My own two hands holding my fan, as in a photograph of a hand of cards: the left one's fingers across the foot of the fan, the right thumb at its side. */
  private myHands(grip: T.Group) {
    const skin = this.standard({ color: "#f0c4a2", roughness: 0.6 }),
      nail = this.standard({ color: "#f7dcd2", roughness: 0.3 }),
      knit = this.standard({ color: "#9a9ea6", roughness: 0.95 }),
      at = (x: number, y: number, z: number) => new T.Vector3(x, y, z),
      // A rounded piece laid from one point to another in the fan's frame (x my right, y up the fan, z toward me).
      limb = (a: T.Vector3, b: T.Vector3, radius: number, material: T.Material) => {
        const mesh = this.part(grip, new T.CapsuleGeometry(radius, Math.max(0.01, a.distanceTo(b)), 6, 12), material, 0, 0, 0);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
        return mesh;
      },
      tip = (a: T.Vector3, b: T.Vector3) => {
        const way = b.clone().sub(a).normalize(),
          n = this.part(grip, new T.SphereGeometry(0.062, 12, 8), nail, 0, 0, 0);
        n.position.copy(b).addScaledVector(way, 0.02).add(at(0, 0, 0.06));
        n.quaternion.setFromUnitVectors(UP, way);
        n.scale.set(0.95, 1.1, 0.35);
      };
    // The left hand: the palm behind the foot of the fan, four fingers coming round its left edge and lying across the front.
    this.part(grip, new T.SphereGeometry(0.4, 16, 12), skin, -0.42, -0.2, -0.16).scale.set(1.1, 1.05, 0.45);
    [0.16, 0.0, -0.16, -0.31].forEach((y, k) => {
      const root = at(-0.66, y - 0.04, -0.02),
        knuckle = at(-0.5, y, 0.14),
        end = at(-0.08 - k * 0.07, y + 0.03, 0.17);
      limb(root, knuckle, 0.088, skin);
      limb(knuckle, end, 0.084, skin);
      tip(knuckle, end);
    });
    // Its wrist and the sleeve of a grey jumper, going down out of sight.
    limb(at(-0.62, -0.45, -0.08), at(-0.95, -1.5, 0.25), 0.27, skin);
    limb(at(-0.98, -1.45, 0.25), at(-1.35, -3.6, 0.7), 0.4, knit);
    // The right hand: the palm behind the right of the fan, the thumb lying along the front toward the middle.
    this.part(grip, new T.SphereGeometry(0.42, 16, 12), skin, 0.62, 0.05, -0.16).scale.set(1.0, 1.1, 0.42);
    const base = at(0.82, -0.12, 0.02),
      joint = at(0.66, 0.16, 0.15),
      end = at(0.46, 0.42, 0.18);
    limb(base, joint, 0.11, skin);
    limb(joint, end, 0.095, skin);
    tip(joint, end);
    limb(at(0.78, -0.35, -0.1), at(1.05, -1.45, 0.2), 0.27, skin);
    limb(at(1.08, -1.4, 0.2), at(1.45, -3.6, 0.65), 0.4, knit);
  }
  protected subject(): TableSubject {
    return { half: L.HALF_X, halfZ: L.HALF_Z, height: 0.4, lookY: 0, tilt: 1.0 };
  }
  /** The view from my seat: as wide as needed to keep the students at the left and right in sight. */
  protected resize() {
    super.resize();
    const aspect = this.camera.aspect || 1.5,
      across = (2 * Math.atan(Math.tan((42 * Math.PI) / 180) / aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(50, across);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(L.EYE);
    this.camera.lookAt(L.LOOK);
    this.redraw();
  }
  /** The order a seat's cards are shown in: mine by rank, the others as they are held. */
  private order(s: State, seat: number) {
    return seat === 0 ? mineSorted(s.hands[0]) : s.hands[seat];
  }
  /** How each seat holds its cards in a state: the one drawn from holds them out to the one who draws. */
  private holds(s: State) {
    const over = s.winner !== null,
      giver = over ? -1 : source(s, s.seat);
    return Array.from({ length: SEATS }, (_, seat) => (over || !s.hands[seat].length ? null : holdOf(seat, seat === giver ? s.seat : null)));
  }
  protected arrange(s: State) {
    const poses = new Map<number, CardPose>(),
      holds = this.holds(s);
    for (let seat = 0; seat < SEATS; seat++) {
      const cards = this.order(s, seat),
        hold = holds[seat];
      cards.forEach((id, i) => {
        if (hold) {
          const c = fanCard(hold, i, cards.length);
          poses.set(id, { x: c.centre.x, y: c.centre.y, z: c.centre.z, up: true, q: c.q, s: hold.s });
        } else {
          // At the end the thief's joker is laid face up on the desk before it.
          const at = L.SEATS[seat];
          poses.set(id, { x: at.x + at.fx * 3.6 + i * 0.3, y: 0.02, z: at.z + at.fz * 3.6, up: true, turn: Math.atan2(at.fx, at.fz), s: 1.3 });
        }
      });
    }
    // Pairs laid down: two by two in a loose heap in the middle of the desks.
    s.pairs.forEach((id, i) => {
      const pair = Math.floor(i / 2);
      poses.set(id, { x: Math.sin(pair * 2.1) * 1.8 + (i % 2) * 0.3 + 0.4, y: 0.02 + i * 0.004, z: Math.cos(pair * 1.3) * 1.0 - 1.7, up: true, turn: Math.sin(pair * 1.7) * 0.6, s: 1 });
    });
    return poses;
  }
  /** Sets every seat's hands (and the computers' arms) where their fans are. */
  private pose(grips: Grip[]) {
    this.held = grips;
    grips.forEach((g, seat) => {
      this.grips[seat].position.copy(g.at);
      this.grips[seat].quaternion.copy(g.q);
      this.grips[seat].updateMatrixWorld();
    });
    const hand = new T.Vector3(),
      along = new T.Vector3(),
      out = new T.Vector3(),
      elbow = new T.Vector3();
    for (const arm of this.arms) {
      hand.set(arm.side * 0.3, -0.12, 0.2);
      this.grips[arm.seat].localToWorld(hand);
      const s = L.SEATS[arm.seat],
        reach = hand.clone().sub(arm.shoulder),
        d = Math.min(reach.length(), UPPER + FORE - 0.05);
      along.copy(reach).normalize();
      const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d),
        right = new T.Vector3(s.fx, 0, s.fz).cross(UP);
      // The elbow drops down and out to the side.
      out.set(0, -1, 0).addScaledVector(right, arm.side * 0.8).addScaledVector(along, -out.dot(along)).normalize();
      out.addScaledVector(along, -out.dot(along)).normalize();
      elbow.copy(arm.shoulder).addScaledVector(along, a).addScaledVector(out, Math.sqrt(Math.max(0, UPPER * UPPER - a * a)));
      const wrist = arm.shoulder.clone().addScaledVector(along, d);
      this.bone(arm.upper, arm.shoulder, elbow);
      this.bone(arm.fore, elbow, wrist);
      arm.elbow.position.copy(elbow);
    }
  }
  private bone(mesh: T.Mesh, a: T.Vector3, b: T.Vector3) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  }
  private gripsOf(s: State) {
    return this.holds(s).map((hold, seat) => (hold ? frameOf(hold) : resting(seat)));
  }
  protected place(s: State) {
    super.place(s);
    this.lifted = -1;
    this.pose(this.gripsOf(s));
    // My hands go out of sight when I hold no cards.
    this.grips[0].visible = s.winner === null && s.hands[0].length > 0;
  }
  protected animate(before: State, s: State) {
    if (s.ply !== before.ply + 1 || !s.last) return false;
    const from = this.arrange(before),
      to = this.arrange(s),
      { card, laid, seat } = s.last;
    // Over Wi-Fi a card that comes into my sight (or goes out of it) starts where its blind card was.
    this.unveil(before, s, from, to);
    this.poses = to;
    const a = from.get(card),
      b = to.get(card);
    if (!a || !b) return false;
    // The drawn card goes from the hand held out to the one who drew it, and on to the middle when it makes a pair.
    if (laid.includes(card)) {
      const hold = holdOf(seat, null),
        n = before.hands[seat].length + 1,
        mid = fanCard(hold, n - 1, n);
      const held: CardPose = { x: mid.centre.x, y: mid.centre.y, z: mid.centre.z, up: true, q: mid.q, s: hold.s };
      this.fly(card, a, held, 0, 420, false);
      this.fly(card, held, b, 620, 380, true);
    } else this.fly(card, a, b, 0, 460, true);
    const later = 620;
    laid.filter((id) => id !== card).forEach((id) => this.fly(id, from.get(id)!, to.get(id)!, later, 380, false));
    // Every other card that changed its place (the hands rearranged, a fan held out or taken back) goes with the hands.
    this.cards.forEach((_, id) => {
      if (id === card || laid.includes(id)) return;
      const p = from.get(id),
        q = to.get(id);
      // A card gone out of sight (its blind card took its place) is put away; one come into it is laid.
      if (!q) this.cards[id].visible = false;
      else if (!p) this.put(this.cards[id], q);
      if (!p || !q) return;
      const moved = Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.z - q.z) > 0.004 || (p.q && q.q && p.q.angleTo(q.q) > 0.01);
      if (moved) this.fly(id, p, q, later, 420, false);
    });
    const start = this.gripsOf(before),
      end = this.gripsOf(s);
    this.pose(start);
    this.grips[0].visible = before.hands[0].length > 0;
    this.tween(later, 420, (p) => {
      const e = p * p * (3 - 2 * p);
      this.pose(start.map((g, i) => ({ at: g.at.clone().lerp(end[i].at, e), q: g.q.clone().slerp(end[i].q, e) })));
      if (p === 1) this.grips[0].visible = s.winner === null && s.hands[0].length > 0;
    });
    return true;
  }
  /** The cards of the hand I draw from, with where a tap on each counts. */
  private offered(s: State) {
    if (s.winner !== null || s.seat !== 0) return [];
    const from = source(s, 0),
      cards = this.order(s, from),
      hold = holdOf(from, 0);
    return cards.map((id, i) => ({ id, at: fanSpot(hold, i, cards.length), hold, i, n: cards.length }));
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s) return [];
    return this.offered(s).map(({ id, at }) => ({ x: at.x, y: at.y, z: at.z, r: 0.3, point: id }));
  }
  private striker = new T.Raycaster();
  /** A tap counts for the card it strikes first, the one in sight there (the user found taps landing on a neighbour). */
  protected pick(ray: T.Ray) {
    const s = this.state;
    if (!s || this.animating) return null;
    const ids = this.offered(s).map((c) => c.id);
    if (!ids.length) return null;
    this.striker.ray.copy(ray);
    const meshes = ids.map((id) => this.cards[id]);
    for (const mesh of meshes) mesh.updateMatrixWorld();
    const hit = this.striker.intersectObjects(meshes, false)[0];
    return hit ? ids[meshes.indexOf(hit.object as T.Mesh)] : null;
  }
  /** The card under the mouse is drawn a little out of the fan, so that it is plain which one a click takes. */
  private lifted = -1;
  protected hover(point: number) {
    this.lift(point);
  }
  private lift(id: number) {
    if (id === this.lifted) return;
    const s = this.state,
      was = this.poses.get(this.lifted);
    if (this.lifted >= 0 && was) this.put(this.cards[this.lifted], was);
    this.lifted = -1;
    const card = s && !this.animating ? this.offered(s).find((c) => c.id === id) : undefined,
      pose = card && this.poses.get(id);
    if (card && pose) {
      this.lifted = id;
      const { u } = fanCard(card.hold, card.i, card.n);
      this.cards[id].position.set(pose.x, pose.y, pose.z).addScaledVector(u, 0.22 * card.hold.s);
    }
    this.redraw();
  }
  protected mark(marks: Marks) {
    const s = this.state,
      lit = s && !this.animating && !capturing() ? this.offered(s) : [];
    this.frames.forEach((frame, k) => {
      const card = lit[k];
      frame.visible = !!card;
      if (!card) return;
      const c = fanCard(card.hold, card.i, card.n);
      frame.position.copy(c.centre).addScaledVector(card.hold.n, 0.012);
      frame.quaternion.copy(c.q);
      frame.scale.setScalar(card.hold.s);
    });
    const chosen = lit.find((c) => c.id === marks.cursor);
    this.cursor.visible = !!chosen;
    if (chosen) {
      this.lift(chosen.id);
      const { u } = fanCard(chosen.hold, chosen.i, chosen.n);
      this.cursor.position.copy(chosen.at).addScaledVector(u, 0.22 * chosen.hold.s);
      this.cursor.lookAt(this.camera.position);
    }
  }
}
