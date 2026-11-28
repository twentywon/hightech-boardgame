import type * as T from "three";

/**
 * Numbers of the lake and the angler that the view and browser tests share, free of Vite-only imports (the view's
 * `capturing` is not): the pier's deck, the angler's eye and where it looks, and the hand that holds the rod.
 */
export const DECK = { y: 0.8, end: -0.8, back: 14, half: 1.25 };
/** The angler stands on the deck near its end, eyes about 1.6 above it, looking out over the water to the far shore. */
export const EYE = { x: 0, y: 2.45, z: 3.4 },
  LOOK = { x: 0, y: 0.3, z: -16 };
/**
 * The hand at the rod's grip: to the right of and below the eye, a little ahead, high enough that the reel under it
 * is in sight at the lower right (the user asked to see the reel turn).
 */
export const HAND = { x: 0.5, y: 2.14, z: 2.55 };
export const ROD_LENGTH = 4.7;
/** The angler's camera: narrow screens step back a little so that the water to the sides stays in sight. */
export function anglerCamera(camera: T.PerspectiveCamera, aspect: number) {
  const back = aspect < 1.4 ? (1.4 - aspect) * 2.4 : 0;
  camera.position.set(EYE.x, EYE.y + back * 0.25, EYE.z + back);
  camera.lookAt(LOOK.x, LOOK.y, LOOK.z);
  camera.updateMatrixWorld();
}
