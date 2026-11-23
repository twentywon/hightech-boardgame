import type { TableSubject } from "../table/view";
import type { Track } from "./track";

/**
 * Numbers of the slot car table that the view and browser tests share, free of Vite-only imports. The track is laid
 * with the middle of its extent at the origin; `SURFACE` is how far the track's top stands above the table, `DROP` how
 * far below the table the attic's floor lies, and `MARGIN` the table's edge beyond the track.
 */
export const SURFACE = 0.05,
  DROP = 3.4,
  MARGIN = 1.2;
/** The middle of a track's extent on the map, which the view puts at the origin. */
export const centreOf = (track: Track) => ({ x: (track.bounds.minX + track.bounds.maxX) / 2, y: (track.bounds.minY + track.bounds.maxY) / 2 });
/** A point of the map (with its height) in the scene: the map's y runs away from the viewer, along -z. */
export function scenePoint(track: Track, x: number, y: number, h: number) {
  const c = centreOf(track);
  return { x: x - c.x, y: h + SURFACE, z: c.y - y };
}
/**
 * What the camera keeps in view: the whole course, its bridge and the cars on it, seen from the near side and from a
 * little higher on a narrow screen. The top is kept a little clear for the board of laps and places over the table.
 */
export function slotSubject(track: Track, aspect: number): TableSubject {
  const b = track.bounds,
    narrow = aspect < 1.4,
    // A wide, short screen (a phone on its side) keeps the ends of the track clear of the pedals in its corners.
    wide = aspect > 1.9 ? 1.08 : 1;
  return {
    half: ((b.maxX - b.minX) / 2) * wide + 0.5,
    halfZ: (b.maxY - b.minY) / 2 + (narrow ? 0.9 : 0.6),
    height: 1.3,
    lookY: narrow ? 0.4 : 0.6,
    tilt: narrow ? 1.12 : 1.0,
  };
}
