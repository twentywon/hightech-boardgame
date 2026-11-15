/**
 * Where things lie on the go-stop table, kept free of Vite-only imports so that browser tests can aim at the cards.
 * A card is CW by CH before it is scaled.
 */
export const GOSTOP_LAYOUT = {
  CW: 0.74,
  CH: (0.74 * 343) / 210,
  HAND_Z: 3.75,
  HAND_STEP: 0.8,
  HAND_SCALE: 1,
  /** How far apart the cards of three held together lie. */
  BUNDLE_STEP: 0.3,
  RIVAL_Z: -3.85,
  RIVAL_STEP: 0.52,
  RIVAL_SCALE: 0.75,
  /** The pile stands in the middle; the floor's months are laid on either side of it. */
  PILE_X: 0,
  FLOOR_LEFT: -3.65,
  FLOOR_RIGHT: 1.35,
  FLOOR_STEP: 1.1,
  FLOOR_Z: 0.72,
  /** The score tablets, below and above the pile. */
  PLATE_W: 1.8,
  PLATE_D: 0.78,
  PLATE_Z: 1.32,
  TAKEN_X: -4.25,
  TAKEN_Z: 2.3,
  TAKEN_STEP: 0.17,
  TAKEN_SCALE: 0.62,
  /** How far each further row of chaff (a row is worth ten) lies toward its owner. */
  PI_DOWN: 0.24,
  /** How much room each kind of taken card has: brights, animals, ribbons. */
  GROUP_WIDTH: [1.4, 2.05, 2.2, 2.4],
  FLIP_AT: 460,
  GATHER_AT: 920,
  SUBJECT: { half: 4.5, halfZ: 4.4, height: 0.3, lookY: 0, tilt: 1.2 },
};
