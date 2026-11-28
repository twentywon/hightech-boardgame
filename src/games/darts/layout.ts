import type * as T from "three";

/**
 * Numbers of the darts table that the view and browser tests share, free of Vite-only imports: the scale of the
 * world, where the board hangs, the thrower's eye, and how a swipe turns into the point aimed at.
 */
/** World units to the millimetre (the pub is built about 0.3 m to a unit). */
export const MM = 1 / 300;
/** The pub's back wall, the face of the board on it, the board's middle, and the floor below it. */
export const WALL_Z = -10.5,
  FACE_Z = WALL_Z + 0.2,
  BOARD_X = 0,
  BOARD_Y = 0,
  FLOOR = 5.77;
/** The chalk scoreboard on the wall at the board's right: its middle and its size. */
export const CHALK = { x: 2.12, y: 0.02, w: 1.45, h: 1.85 };
/** The thrower's eye, at the oche (2.37 m from the face), a little above the board's middle and leaning in. */
export const EYE = { x: 0.12, y: 0.18, z: FACE_Z + 7.9 };
/** Where the eye looks: between the board and the scoreboard. */
const LOOK = { x: 0.84, y: 0.02 };
/** What must stay in view round the point looked at: the board with its cabinet, and the scoreboard. */
const VIEW = { left: BOARD_X - 1.34, right: CHALK.x + CHALK.w / 2 + 0.16, up: 1.42, down: 1.42 };
/** A point of the board (millimetres from the bull, y up) in the world. */
export function boardPoint(x: number, y: number) {
  return { x: BOARD_X + x * MM, y: BOARD_Y + y * MM, z: FACE_Z };
}
/** The narrow, first-person view from the oche, widened as needed so that the board and the scoreboard fit. */
export function dartsCamera(camera: T.PerspectiveCamera, aspect: number) {
  const distance = EYE.z - FACE_Z,
    across = Math.max(LOOK.x - VIEW.left, VIEW.right - LOOK.x),
    half = Math.max(Math.atan(Math.max(VIEW.up, VIEW.down) / distance), Math.atan(across / distance / aspect));
  camera.fov = (half * 2 * 180) / Math.PI;
  camera.aspect = aspect;
  camera.position.set(EYE.x, EYE.y, EYE.z);
  camera.lookAt(LOOK.x, LOOK.y, FACE_Z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
/** A swipe up of this share of the canvas's height aims at the bull; `GAIN` millimetres of the board to a full height of swipe. */
export const CENTRE = 0.3,
  GAIN = 820,
  /** Shorter than this share of the height upward, a swipe throws nothing. */
  LEAST = 0.05;
/** The point a swipe of `dx`, `dy` pixels aims at on a canvas `height` pixels tall (y grows downward); null if it throws nothing. */
export function swipe(dx: number, dy: number, height: number) {
  const up = -dy / height;
  if (up < LEAST) return null;
  return { x: (dx / height) * GAIN, y: (up - CENTRE) * GAIN };
}
/** The swipe (in pixels) that aims at the point (x, y) of the board, on a canvas `height` pixels tall. */
export function swipeFor(x: number, y: number, height: number) {
  return { dx: (x / GAIN) * height, dy: -(y / GAIN + CENTRE) * height };
}
/**
 * A person's unsteady hand while aiming, in millimetres of the board: `drift` is how far the aim wanders (about one
 * standard deviation each way, much as far as a person's darts used to scatter), `shake` the faint quick tremor of
 * the muscles over it.
 */
export const TREMOR = { drift: 16, shake: 1.4 };
/** The swells of the drift across and up (cycles a second, and share of the largest), and of the quick tremor. */
const SWELLS = [
    [[0.17, 1], [0.31, 0.62], [0.53, 0.4]],
    [[0.21, 1], [0.37, 0.58], [0.61, 0.42]],
  ],
  QUICK = [[8.3, 1], [11.1, 0.6]],
  /** How steady the hand is from moment to moment: the drift's size swells between `CALM - EASE` and `CALM + EASE` of itself. */
  CALM = 0.85,
  EASE = 0.15,
  /** The drift's largest swell, so that the drift's spread each way comes to `TREMOR.drift`. */
  SWELL = SWELLS.map((axis) => TREMOR.drift / Math.sqrt((axis.reduce((s, [, w]) => s + w * w, 0) / 2) * (CALM * CALM + (EASE * EASE) / 2)));
/**
 * Where a person's hand has moved the aim `t` seconds into aiming (millimetres, y up): a slow drift of a few swells
 * at unrelated rates, now and then steadier, and a faint quick tremor over it; smooth at every moment. `seed` (any
 * number) starts each aim somewhere else in it, so that the hand is not steadiest just as the aim begins.
 */
export function tremor(t: number, seed: number) {
  // The phases of the swells, spread from the seed.
  let s = Math.abs(Math.floor(seed * 9973)) % 2147483646 + 1;
  const phase = () => ((s = (s * 16807) % 2147483647) / 2147483647) * Math.PI * 2,
    calm = CALM + EASE * Math.sin(2 * Math.PI * 0.11 * t + phase()),
    out = [0, 0];
  for (let axis = 0; axis < 2; axis++) {
    let v = 0;
    for (const [rate, share] of SWELLS[axis]) v += SWELL[axis] * share * calm * Math.sin(2 * Math.PI * rate * t + phase());
    for (const [rate, share] of QUICK) v += TREMOR.shake * share * Math.sin(2 * Math.PI * rate * t + phase());
    out[axis] = v;
  }
  return { x: out[0], y: out[1] };
}
