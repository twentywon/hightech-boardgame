import { Matrix4, Quaternion, Vector3 } from "three";
import { CARD_H } from "../deck/cards";

/**
 * Where everything is round the Old Maid desks, seen in the first person (the user asked): four school desks pushed
 * together, me at the near side, a computer at my left, one across and one at my right. Each holds its cards in a
 * fan before it, faces toward itself; the one whose cards are being drawn holds them out to the one who draws.
 * Free of Vite-only imports, so that browser tests can aim with it.
 */
export const OLDMAID = {
  /** My eyes, and where they look. */
  EYE: new Vector3(0, 5.0, 7.4),
  LOOK: new Vector3(0, 0.6, -2.4),
  /** The top of the desks is at height 0; they reach `HALF_X` and `HALF_Z` from the middle. */
  HALF_X: 5,
  HALF_Z: 4.5,
  /** Where each seat sits (its body at desk height) and which way it faces. */
  SEATS: [
    { x: 0, z: 7.6, fx: 0, fz: -1 },
    { x: -7.6, z: -1.4, fx: 1, fz: 0 },
    { x: 0, z: -7.9, fx: 0, fz: 1 },
    { x: 7.6, z: -1.4, fx: -1, fz: 0 },
  ],
  /** How large a computer's cards are drawn: a little larger than life, so that they can be told apart. */
  THEIRS: 1.25,
  OFFERED: 1.5,
};
const UP = new Vector3(0, 1, 0);
/** A seat's eyes. */
export function eyeOf(seat: number) {
  if (seat === 0) return OLDMAID.EYE.clone();
  const s = OLDMAID.SEATS[seat];
  return new Vector3(s.x + s.fx * 0.5, 5.0, s.z + s.fz * 0.5);
}
/** How a hand of cards is held: the point it fans from, the way the faces look (`n`), the fan's upward way (`u`) and its size. */
export interface Hold {
  pivot: Vector3;
  n: Vector3;
  u: Vector3;
  s: number;
  /** How far the fan opens at most (its whole arc) and between two cards, and how far each card is also slid sideways. */
  arc: number;
  step: number;
  slide: number;
}
/** The fan's upward way for faces looking along `n`: as near to straight up as the fan allows, leaning back a little. */
function upright(n: Vector3) {
  return UP.clone().addScaledVector(n, -UP.dot(n)).normalize();
}
/**
 * How `seat` holds its cards: before it, faces toward its own eyes; or, when `to` draws from it, held out toward
 * that seat with the backs turned to it.
 */
export function holdOf(seat: number, to: number | null = null): Hold {
  const eye = eyeOf(seat),
    s = OLDMAID.SEATS[seat];
  let pivot: Vector3, s0: number;
  if (seat === 0) {
    pivot = to === null ? new Vector3(-0.7, 2.75, 5.0) : new Vector3(0.9, 2.9, 4.6);
    s0 = 1;
  } else {
    const rest = new Vector3(s.x + s.fx * 2.9, 2.2, s.z + s.fz * 2.9);
    if (to === null) pivot = rest;
    else {
      const drawer = eyeOf(to);
      // Held well out to me; to another computer only part of the way.
      pivot = rest.clone().lerp(new Vector3(drawer.x, 2.5, drawer.z), to === 0 ? 0.4 : 0.28);
      pivot.y = 2.5;
    }
    s0 = to === null ? OLDMAID.THEIRS : OLDMAID.OFFERED;
  }
  const middle = pivot.clone().addScaledVector(UP, 0.45 * CARD_H * s0),
    toHolder = eye.clone().sub(middle).normalize();
  let n = toHolder;
  if (to !== null) {
    // Held out: turned mostly away from the one who draws, still a little toward the one who holds.
    const away = middle.clone().sub(eyeOf(to)).normalize();
    n = away.multiplyScalar(seat === 0 ? 0.55 : 1).addScaledVector(toHolder, seat === 0 ? 1 : 0.35).normalize();
  }
  // Spread wide (the user asked): widest when held out to me, so that every card shows enough to be picked.
  const spread = to === 0 ? { arc: Math.PI * 0.82, step: 0.24, slide: 0.075 } : seat === 0 ? { arc: Math.PI * 0.72, step: 0.2, slide: 0.03 } : { arc: Math.PI * 0.68, step: 0.19, slide: 0.03 };
  return { pivot, n, u: upright(n), s: s0, ...spread };
}
/** The holder's right as it looks at its faces. */
export const rightOf = (hold: Hold) => new Vector3().crossVectors(hold.u, hold.n).normalize();
const basis = new Matrix4();
/** The `i`-th of `count` cards in a held fan: where its middle is and its turn (face toward the holder). */
export function fanCard(hold: Hold, i: number, count: number) {
  const step = Math.min(hold.step, hold.arc / Math.max(1, count - 1)),
    k = i - (count - 1) / 2,
    a = k * step,
    r = rightOf(hold),
    u = hold.u.clone().multiplyScalar(Math.cos(a)).addScaledVector(r, Math.sin(a)),
    centre = hold.pivot
      .clone()
      .addScaledVector(u, 0.36 * CARD_H * hold.s)
      .addScaledVector(r, k * hold.slide * hold.s)
      .addScaledVector(hold.n, i * 0.008),
    x = new Vector3().crossVectors(u, hold.n),
    z = u.clone().negate(),
    q = new Quaternion().setFromRotationMatrix(basis.makeBasis(x, hold.n, z));
  return { centre, q, u };
}
/** Where a tap on the `i`-th card of a fan counts: its upper part, which the cards before it leave in sight. */
export function fanSpot(hold: Hold, i: number, count: number) {
  const { centre, u } = fanCard(hold, i, count);
  return centre.addScaledVector(u, 0.28 * CARD_H * hold.s);
}
