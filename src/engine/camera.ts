import { PerspectiveCamera, Vector3 } from "three";

export const FOV = 38;
/** Tilt of the default view above the table, and of the overhead view. */
export const TILT = (55 * Math.PI) / 180;
export const OVERHEAD = Math.PI / 2 - 0.001;

export interface Subject {
  /** Half the width of the square board. */
  half: number;
  /** Height above the table that must stay in view (stones or pieces). */
  height: number;
  /** Height of the point the camera looks at. */
  lookY: number;
  /** Half the depth when the table is not square. */
  halfZ?: number;
  /** Camera elevation for the default view; the shared tilt when omitted. */
  tilt?: number;
}
export const SUBJECTS = {
  gomoku: { half: 3.275, height: 0.35, lookY: 0 },
  reversi: { half: 3.15, height: 0.35, lookY: 0 },
  chess: { half: 3.525, height: 1.45, lookY: 0.1 },
  // Blackjack lays its cards out wide on landscape screens and tall on
  // portrait ones, and looks down more steeply so card faces stay readable.
  blackjackWide: { half: 4.6, halfZ: 3.55, height: 0.3, lookY: 0, tilt: 1.1 },
  blackjackTall: { half: 2.9, halfZ: 3.55, height: 0.3, lookY: 0, tilt: 1.1 },
  // Yacht dice: a tray with a row for the roll and a row for dice set aside.
  yacht: { half: 3.75, halfZ: 3.0, height: 0.9, lookY: 0, tilt: 1.1 },
} as const satisfies Record<string, Subject>;

// Share of the canvas the board may fill. The top and bottom keep room for
// the caption overlays drawn over the canvas. On narrow screens the near
// corners of the wooden rim may run slightly past the sides; the playing area
// stays fully visible.
const FILL = { x: 1.04, top: 0.9, bottom: 0.94 };
const cache = new Map<string, number>();
const probe = new PerspectiveCamera(FOV, 1, 0.1, 200);
const corner = new Vector3();

/**
 * Closest camera distance at which the whole board, with its pieces, fits the
 * canvas. Views and browser tests share it so a click maps to the same square.
 */
export function cameraDistance(
  aspect: number,
  top: boolean,
  subject: Subject,
): number {
  const depth = subject.halfZ ?? subject.half,
    tilt = subject.tilt ?? TILT;
  const key = `${aspect.toFixed(4)}|${top}|${subject.half}|${depth}|${subject.height}|${subject.lookY}|${tilt}`;
  const known = cache.get(key);
  if (known) return known;
  const angle = top ? OVERHEAD : tilt;
  probe.aspect = aspect;
  probe.updateProjectionMatrix();
  const fits = (distance: number) => {
    probe.position.set(0, Math.sin(angle) * distance, Math.cos(angle) * distance);
    probe.lookAt(0, subject.lookY, 0);
    probe.updateMatrixWorld();
    for (const x of [-subject.half, subject.half])
      for (const z of [-depth, depth])
        for (const y of [0, subject.height]) {
          corner.set(x, y, z).project(probe);
          if (
            corner.z > 1 ||
            Math.abs(corner.x) > FILL.x ||
            corner.y > FILL.top ||
            corner.y < -FILL.bottom
          )
            return false;
        }
    return true;
  };
  let near = 4,
    far = 120;
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, far);
  return far;
}
