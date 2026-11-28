import * as T from "three";

/**
 * Carrom men and the striker, turned on a lathe: a flat foot, a softly rounded rim and a top cut with rings, the
 * way wooden men are turned. Each is a unit disc 0.14 thick (scaled by its radius across, as the old cylinders
 * were); the rings are darkened through vertex colours, so a man is one draw.
 */
type Ring = [radius: number, height: number, shade: number | [number, number, number]];

function turned(profile: Ring[], segments: number) {
  const points = profile.map(([r, y]) => new T.Vector2(r, y)),
    geometry = new T.LatheGeometry(points, segments),
    colours: number[] = [];
  // Lathe vertices run profile point by profile point within each meridian.
  for (let s = 0; s <= segments; s++) for (const [, , shade] of profile) colours.push(...(typeof shade === "number" ? [shade, shade, shade] : shade));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  return geometry;
}
const H = 0.07;
/** A man: two cut rings on its face and a raised boss in the middle. */
export function manGeometry(segments = 36) {
  return turned(
    [
      [0, -H, 0.7],
      [0.9, -H, 0.7],
      [0.97, -H + 0.008, 0.8],
      [1, -H + 0.03, 0.95],
      [1, H - 0.03, 1],
      [0.97, H - 0.008, 1],
      [0.92, H, 1],
      [0.86, H, 1],
      [0.83, H - 0.016, 0.55],
      [0.79, H - 0.016, 0.55],
      [0.76, H, 1],
      [0.56, H, 1],
      [0.53, H - 0.012, 0.6],
      [0.49, H - 0.012, 0.6],
      [0.46, H, 1],
      [0.2, H + 0.004, 1],
      [0.12, H + 0.006, 0.92],
      [0, H + 0.006, 0.92],
    ],
    segments,
  );
}
/** The striker: heavier, plainer, with one wide painted band and a ring at its middle. */
export function strikerGeometry(segments = 40) {
  const band: [number, number, number] = [0.72, 0.16, 0.14];
  return turned(
    [
      [0, -H, 0.8],
      [0.92, -H, 0.8],
      [0.98, -H + 0.01, 0.9],
      [1, -H + 0.035, 1],
      [1, H - 0.035, 1],
      [0.98, H - 0.01, 1],
      [0.93, H, 1],
      [0.8, H, 1],
      [0.79, H, band],
      [0.66, H, band],
      [0.65, H, 1],
      [0.3, H, 1],
      [0.29, H - 0.008, band],
      [0.2, H - 0.008, band],
      [0.19, H, 1],
      [0, H, 1],
    ],
    segments,
  );
}
