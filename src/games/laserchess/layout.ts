import type { TableSubject } from "../table/view";

/*
 * Where everything of 레이저 체스 stands, in table units, free of Vite-only imports so that browser tests can aim
 * with the same numbers as the view. A square is one unit; the board's top is at y = 0, its middle at the origin.
 * Column c runs along x from the left as the silver side sees it, row r along z from the far edge (row 0) to the
 * near one (row 7), where the silver side sits. Seen by the gold side the table is turned half round (`orbitOf`).
 */
export const COLS = 10,
  ROWS = 8;
/** The rim of the board round the squares, and the board's thickness. */
export const RIM = 0.42,
  BOARD_THICK = 0.34;
/** The height at which the beams run: the middle of every mirror, shield and lens. */
export const BEAM_Y = 0.3;
/** The middle of a square on the board's top. */
export const cellAt = (cell: number) => ({ x: (cell % COLS) - (COLS - 1) / 2, z: Math.floor(cell / COLS) - (ROWS - 1) / 2 });
/** Where a tap on a piece aims: its body, a little above the board. */
export const piecePoint = (cell: number) => ({ ...cellAt(cell), y: 0.22 });
/** Where a tap on an empty square aims: its middle. */
export const squarePoint = (cell: number) => ({ ...cellAt(cell), y: 0 });
/** From which side the table is seen: 0 from the silver side's, π from the gold side's. */
export const orbitOf = (facing: 0 | 1) => facing * Math.PI;
/** The two buttons that turn a piece picked up: over the piece, one at each hand of the one who sits facing it. */
export const BUTTON = { y: 1.2, spread: 0.5, radius: 0.27 };
/** The middle of a turn button over `cell` (`left` turns against the clock), seen from the side `facing`. */
export function turnButton(cell: number, left: boolean, facing: 0 | 1) {
  const at = cellAt(cell),
    // The right hand of one who sits at that side: +x for the silver side, −x for the gold.
    right = facing === 0 ? 1 : -1,
    s = (left ? -1 : 1) * BUTTON.spread * right;
  return { x: at.x + s, y: BUTTON.y, z: at.z };
}
/**
 * How far the view is moved toward the left hand of the one who sits at the table, so that the board stands a little
 * right of the middle: on screens of middling width the lettering at the table's lower left would otherwise stand
 * over the near corner of the board. Wide screens (phones held sideways) have room enough beside the board.
 */
export const viewShift = (aspect: number) => (aspect >= 1.25 && aspect < 1.9 ? 0.6 : 0);
/** Where the camera looks from and at, seen from `facing` (at an angle `orbit` round the table) for a canvas of `aspect`, at `distance`. */
export function eyeOf(aspect: number, orbit: number, distance: number) {
  const subject = laserSubject(aspect),
    flat = Math.cos(subject.tilt) * distance,
    shift = viewShift(aspect),
    // The viewer's right hand is (cos, 0, −sin) of the orbit; the view moves the other way.
    tx = -Math.cos(orbit) * shift,
    tz = Math.sin(orbit) * shift;
  return { eye: { x: tx + Math.sin(orbit) * flat, y: Math.sin(subject.tilt) * distance, z: tz + Math.cos(orbit) * flat }, target: { x: tx, y: subject.lookY, z: tz } };
}
/** What the camera keeps in view: the board with its rim and the pieces standing on it, and the buttons over the far row. */
export function laserSubject(aspect: number): TableSubject {
  return { half: COLS / 2 + RIM + 0.12, halfZ: ROWS / 2 + RIM + 0.1, height: 1.2, lookY: 0, tilt: aspect < 1.2 ? 1.12 : 1.08 };
}
