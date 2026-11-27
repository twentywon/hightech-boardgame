/** Where things stand at 러시안 룰렛's party table, free of Three.js so that browser tests can aim. The cloth is y = 0. */
export const RR = {
  SUBJECT: { half: 4.7, halfZ: 4.3, height: 1.9, lookY: 0.55, tilt: 0.8 },
  TABLE_R: 2.6,
  FLOOR_Y: -1.9,
  /** The guests' chairs from the middle, their bodies' middles and their heads, above the cloth. */
  SEAT_R: 3.55,
  BODY_Y: 0.0,
  SHOULDER_Y: 0.42,
  HEAD_Y: 1.08,
  /** The toy's size where it lies on the table at the end. */
  TOY_SCALE: 1.75,
  /**
   * Where the toy's muzzle rests on the holder's right temple (the user asked for the toy put to the head), in the
   * holder's own frame (x to its right, z away from the table), and how large the toy is drawn there.
   */
  TEMPLE_X: 0.37,
  TEMPLE_UP: 0.07,
  TEMPLE_Z: -0.03,
  TEMPLE_SCALE: 1.05,
  /** A 펑 flings the holder off the chair (the user asked): how long the flight takes, and where it lands in its frame. */
  FLING_MS: 1250,
  LIE_X: -1.95,
  LIE_Z: 1.0,
  /** How long I hold the toy to pull its trigger all the way, a pull's slow squeeze, and the pass to the next. */
  HOLD_MS: 900,
  SQUEEZE_MS: 1100,
  PASS_MS: 650,
};
