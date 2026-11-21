import type * as T from "three";

/**
 * Numbers of the archery range that the view and browser tests share, free of Vite-only imports: the world (metres),
 * the archer's eye and the two ways it looks (the range at rest, the target while the bow is drawn), how a drag
 * moves the sight pin, how long a draw takes and how the hand trembles and tires while it holds.
 */
/** The face's plane and its middle in the world (the shooting line is at z = 0, the range runs toward −z). */
export const FACE_Z = -70,
  FACE_Y = 1.3;
/** The archer's eye at the shooting line, a little above and behind the arrow. */
export const EYE = { x: 0, y: 1.62, z: 0.12 };
/** At rest the eye takes in the range (vertical field, degrees, and the point looked at); drawn it closes on the target. */
const REST = { fov: 17, y: 3.3 },
  AIM = { fov: 2.7, y: FACE_Y + 0.32 },
  /** What must stay in view across while drawn: the face and a little round it (m either side of the middle). */
  AIM_ACROSS = 1.05,
  /** At rest, the least the eye takes in across (the tangent of half the field): both socks and the scoreboard. */
  REST_ACROSS = 0.25;
/** How far the eye has closed on the target: 0 at rest, 1 drawn. The field narrows smoothly (by its tangent). */
export function archerCamera(camera: T.PerspectiveCamera, aspect: number, zoom: number) {
  const z = Math.max(0, Math.min(1, zoom)),
    ease = z * z * (3 - 2 * z),
    near = Math.tan((AIM.fov * Math.PI) / 360),
    // Narrow screens widen the drawn view so that the face stays whole across.
    wide = Math.max(near, AIM_ACROSS / (EYE.z - FACE_Z) / aspect),
    far = Math.max(Math.tan((REST.fov * Math.PI) / 360), REST_ACROSS / aspect),
    half = Math.exp(Math.log(far) + (Math.log(wide) - Math.log(far)) * ease);
  camera.fov = (Math.atan(half) * 360) / Math.PI;
  camera.aspect = aspect;
  camera.position.set(EYE.x, EYE.y, EYE.z);
  camera.lookAt(0, REST.y + (AIM.y - REST.y) * ease, FACE_Z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
/** How far (mm on the face) the pin moves for a drag the canvas's height long; a drag right or up moves it right or up. */
export const GAIN = 1000;
/** Where a drag of `dx`, `dy` pixels (y grows downward) on a canvas `height` pixels tall moves the pin from the middle (mm). */
export const dragAim = (dx: number, dy: number, height: number) => ({ x: (dx / height) * GAIN, y: (-dy / height) * GAIN });
/** The drag (pixels) that moves the pin by (x, y) mm, on a canvas `height` pixels tall. */
export const dragFor = (x: number, y: number, height: number) => ({ dx: (x / GAIN) * height, dy: (-y / GAIN) * height });
/** How long the bow takes to come to full draw (ms); let go sooner, it is let down and nothing is shot. */
export const DRAW = 700;
/** How far below the middle the pin starts as the bow comes up (mm), settling in as it comes to full draw. */
export const RISE = 420;
/** The pin's offset while the bow comes up, `ms` after the press: from below the middle to nothing at full draw. */
export function rising(ms: number) {
  const p = Math.max(0, Math.min(1, ms / DRAW)),
    ease = 1 - (1 - p) ** 3;
  return -RISE * (1 - ease);
}
/**
 * A person's unsteady hold, in millimetres on the face: `drift` is how far the pin wanders (about one standard
 * deviation each way), `shake` the faint quick tremor of the muscles over it. Both grow once the bow has been held
 * at full draw longer than `steady` seconds (`fatigue`).
 */
export const TREMOR = { drift: 24, shake: 2, steady: 4 };
/** How much larger the hold's wander has grown after `held` seconds at full draw: 1 while fresh, then more and more, up to four times. */
export function fatigue(held: number) {
  const over = Math.max(0, held - TREMOR.steady);
  return Math.min(4, 1 + 0.25 * over + 0.025 * over * over);
}
/** The swells of the drift across and up (cycles a second, and share of the largest), and of the quick tremor. */
const SWELLS = [
    [[0.19, 1], [0.33, 0.6], [0.57, 0.38]],
    [[0.23, 1], [0.41, 0.56], [0.67, 0.4]],
  ],
  QUICK = [[8.7, 1], [10.9, 0.6]],
  /** The drift's largest swell, so that its spread each way comes to `TREMOR.drift`. */
  SWELL = SWELLS.map((axis) => TREMOR.drift / Math.sqrt(axis.reduce((s, [, w]) => s + w * w, 0) / 2));
/**
 * Where the hand has moved the pin `t` seconds into a draw (mm, y up), `held` seconds of it at full draw: a slow
 * drift of a few swells at unrelated rates and a faint quick tremor over it, both growing with fatigue (the quick
 * tremor the faster); smooth at every moment. `seed` (any number) starts each draw somewhere else in it.
 */
export function tremor(t: number, seed: number, held = 0) {
  let s = (Math.abs(Math.floor(seed * 9973)) % 2147483646) + 1;
  const phase = () => ((s = (s * 16807) % 2147483647) / 2147483647) * Math.PI * 2,
    tired = fatigue(held),
    out = [0, 0];
  for (let axis = 0; axis < 2; axis++) {
    let v = 0;
    for (const [rate, share] of SWELLS[axis]) v += SWELL[axis] * share * tired * Math.sin(2 * Math.PI * rate * t + phase());
    for (const [rate, share] of QUICK) v += TREMOR.shake * share * tired ** 1.5 * Math.sin(2 * Math.PI * rate * t + phase());
    out[axis] = v;
  }
  return { x: out[0], y: out[1] };
}
