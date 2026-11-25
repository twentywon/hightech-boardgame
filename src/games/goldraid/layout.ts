import type { TableSubject } from "../table/view";

/**
 * How the valley of 금화 쟁탈전 is framed, free of Vite-only imports. It is seen from the side, almost level: the road
 * from gate to gate must fit across (`ACROSS`, half of it) and the air over the highest ledge up to where a jump from
 * it reaches (`ABOVE`). `road` is how far down the canvas the road lies, as a share: a phone's buttons stand at the
 * bottom, so there the road is lifted clear of them and the earth under it fills the strip they cover.
 */
export const ACROSS = 11.9,
  ABOVE = 7.8,
  TILT = 0.1;
export interface Frame {
  /** The height of the valley seen at the road's depth, the height looked at, and the road's share down the canvas. */
  span: number;
  lookY: number;
  road: number;
}
export function goldRaidFrame(aspect: number, pad: boolean): Frame {
  const road = aspect < 1.2 ? 0.6 : pad ? 0.72 : 0.78,
    span = Math.max((2 * (aspect < 1.2 ? ACROSS - 1 : ACROSS)) / aspect, ABOVE / road);
  return { span, lookY: (road - 0.5) * span, road };
}
/** The same for the table view's own fitting (the view then sets its camera by `goldRaidFrame`). */
export const goldRaidSubject = (aspect: number): TableSubject => ({ half: ACROSS, halfZ: 0.5, height: ABOVE, lookY: 3, tilt: TILT });
