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
  /** Where the toy is held up before whoever's turn it is: from the middle, and above the cloth. */
  HOLD_R: 2.25,
  HOLD_SIDE: 0.95,
  HOLD_Y: 0.85,
  TOY_SCALE: 1.75,
  /** How long I hold the toy to pull its trigger all the way, a pull's slow squeeze, and the pass to the next. */
  HOLD_MS: 900,
  SQUEEZE_MS: 1100,
  PASS_MS: 650,
};
