/**
 * The slot car courses, free of Three.js and the page: each course is a closed line of track pieces (straights and
 * curves) carrying up to four lanes side by side, and this module says where every lane runs and how fast its curves
 * may be taken.
 *
 * Coordinates are a flat map seen from above: x to the right, y away from the viewer (the view lays y along -z),
 * headings counted anticlockwise from +x, and a lane's offset `d` is measured to the left of the way of travel.
 *
 * Every course is a figure of eight (two lobes, one turned clockwise and one anticlockwise, the track crossing itself
 * over a bridge): the track turns as far left as right, so every lane is exactly as long as the others although each
 * curve has an inner and an outer lane (on one lobe a lane is inside, on the other it is outside). The lanes never
 * change places, so every car keeps a slot of its own for the whole race.
 */
export const LANE_W = 0.5,
  BORDER = 0.26,
  /** The height of the bridge where the track passes over itself. */
  BRIDGE = 0.95;
/** The grip of a car's magnet and tyres, as the most sideways acceleration a slot keeps it through (units/s²). */
export const GRIP = 16;
/** How much a banked curve adds to the grip, by the tangent of its bank. */
export const BANK_GAIN = 1.5;
export type Piece =
  | { kind: "straight"; length: number; rise?: number }
  /** `angle` in degrees, anticlockwise positive (a left-hand curve). */
  | { kind: "curve"; radius: number; angle: number; bank?: number; rise?: number };
export interface Segment {
  kind: "straight" | "curve";
  /** Its length along the middle of the track, and where it begins along the middle (from the start line). */
  length: number;
  start: number;
  radius: number;
  /** Signed turn in radians (anticlockwise positive); 0 on a straight. */
  turn: number;
  bank: number;
  /** Where its middle begins and the heading there; a curve's centre. */
  x: number;
  y: number;
  heading: number;
  cx: number;
  cy: number;
  /** Height of the track at its two ends. */
  h0: number;
  h1: number;
}
export interface Track {
  course: Course;
  lanes: number;
  /** Each lane's offset to the left of the middle line. */
  offsets: number[];
  segments: Segment[];
  /** One lap along the middle line (every lane is as long). */
  length: number;
  /** The extent of the track's surface on the map. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Half the width of the surface. */
  half: number;
}
export interface Course {
  value: string;
  name: string;
  note: string;
  pieces: Piece[];
  /** The piece the start line lies at the beginning of (the pieces are laid from the crossing). */
  start: number;
}
const S = (length: number, rise = 0): Piece => ({ kind: "straight", length, rise });
const C = (angle: number, radius: number, bank = 0, rise = 0): Piece => ({ kind: "curve", radius, angle, bank, rise });
/** The side-shift of a run of pieces laid from heading 0 (anticlockwise turns rise), for a lobe's far turn. */
function shift(pieces: Piece[]) {
  let y = 0,
    heading = 0;
  for (const p of pieces) {
    if (p.kind === "straight") y += Math.sin(heading) * p.length;
    else {
      const turn = (p.angle * Math.PI) / 180,
        end = heading + turn;
      y += (Math.cos(heading) - Math.cos(end)) * p.radius * Math.sign(turn);
      heading = end;
    }
  }
  return y;
}
/**
 * One lobe of a figure of eight, laid from the crossing (heading out at 45° from the line between the lobes) and back
 * to it: a straight as long as `radius`, an eighth of a turn, the run `run` along its top (its turns counted outward
 * from the middle line as positive), the far end turning half round (one curve, or two quarter curves of `end` with a
 * straight between them when `end` is smaller), the run again in mirror along its bottom, an eighth of a turn and the
 * straight back into the crossing. `side` 1 is the right lobe (clockwise), -1 the left (anticlockwise). Laid this way
 * the lobe is symmetric about the middle line and so always closes. `rise` climbs (or falls) over the far end.
 */
function lobe(side: 1 | -1, radius: number, run: Piece[], far: { end?: number; bank?: number; rise: number }) {
  const t = side === 1 ? -1 : 1,
    // A turn outward from the middle line, for this lobe's top run.
    out = (p: Piece): Piece => (p.kind === "curve" ? { ...p, angle: -t * p.angle } : p),
    top = run.map(out),
    reach = radius + shift(run),
    end = far.end && far.end < reach ? far.end : reach,
    gap = 2 * reach - 2 * end,
    turns: Piece[] =
      gap > 1e-6
        ? [C(t * 90, end, far.bank ?? 0, far.rise * 0.3), S(gap, far.rise * 0.4), C(t * 90, end, far.bank ?? 0, far.rise * 0.3)]
        : [C(t * 180, end, far.bank ?? 0, far.rise)];
  return [S(radius), C(t * 45, radius), ...top, ...turns, ...[...top].reverse(), C(t * 45, radius), S(radius)];
}
/**
 * The courses (the user asked for several; all of them our own): the plain eight to learn on, a fast lobe with a
 * banked turn beside a tight little loop, a twisting one with a hairpin and S-bends, and a long circuit with banked
 * sweeps and a chicane. In each the crossing's second pass runs over the bridge: its right lobe climbs over its far
 * turn and its left lobe comes down over its own.
 */
export const COURSES: Course[] = [
  {
    value: "eight",
    name: "8자 코스",
    note: "둥근 두 고리와 고가 다리 하나",
    pieces: [...lobe(1, 3, [S(2.5)], { rise: BRIDGE }), ...lobe(-1, 3, [S(2.5)], { rise: -BRIDGE })],
    start: 2,
  },
  {
    value: "bank",
    name: "뱅크 오벌",
    note: "기울어진 큰 코너와 좁은 고리",
    pieces: [...lobe(1, 2, [], { rise: BRIDGE }), ...lobe(-1, 3.5, [S(6.5)], { bank: 0.42, rise: -BRIDGE })],
    start: 9,
  },
  {
    value: "hairpin",
    name: "헤어핀 고개",
    note: "급한 헤어핀과 S자 굽이",
    pieces: [
      ...lobe(1, 2.5, [S(1.2), C(-40, 1.75), C(40, 1.75), S(0.8)], { rise: BRIDGE }),
      ...lobe(-1, 3.2, [S(1.5), C(35, 2.6), C(-35, 2.6), S(1.2)], { end: 2.2, rise: -BRIDGE }),
    ],
    start: 2,
  },
  {
    value: "grand",
    name: "그랜드 서킷",
    note: "긴 직선, 뱅크 코너, 시케인",
    pieces: [
      ...lobe(1, 3, [S(1.5), C(45, 3), S(2), C(-45, 3), S(5)], { end: 3.2, bank: 0.4, rise: BRIDGE }),
      ...lobe(-1, 3, [S(2), C(-30, 3), C(30, 3), S(2)], { bank: 0.2, rise: -BRIDGE }),
    ],
    start: 2,
  },
];
export const courseOf = (value: string) => COURSES.find((c) => c.value === value) ?? COURSES[0];
/** Lane offsets for `lanes` lanes, lane 0 the leftmost (seen along the way of travel). */
export const offsetsOf = (lanes: number) => Array.from({ length: lanes }, (_, k) => ((lanes - 1) / 2 - k) * LANE_W);
/** Lays a course's pieces from the crossing, then begins the list at its start line. */
export function buildTrack(value: string, lanes = 4): Track {
  const course = courseOf(value),
    laid: Segment[] = [];
  let x = 0,
    y = 0,
    heading = Math.PI / 4,
    h = 0;
  for (const p of course.pieces) {
    const rise = p.rise ?? 0,
      seg: Segment = { kind: p.kind, length: 0, start: 0, radius: 0, turn: 0, bank: 0, x, y, heading, cx: 0, cy: 0, h0: h, h1: h + rise };
    if (p.kind === "straight") {
      seg.length = p.length;
      x += Math.cos(heading) * p.length;
      y += Math.sin(heading) * p.length;
    } else {
      const turn = (p.angle * Math.PI) / 180,
        sign = Math.sign(turn);
      Object.assign(seg, { length: Math.abs(turn) * p.radius, radius: p.radius, turn, bank: p.bank ?? 0 });
      seg.cx = x - Math.sin(heading) * p.radius * sign;
      seg.cy = y + Math.cos(heading) * p.radius * sign;
      heading += turn;
      x = seg.cx + Math.sin(heading) * p.radius * sign;
      y = seg.cy - Math.cos(heading) * p.radius * sign;
    }
    h += rise;
    laid.push(seg);
  }
  const segments = [...laid.slice(course.start), ...laid.slice(0, course.start)];
  // The heights from the start line (ground level there), so that the bridge is the pass that climbed.
  const base = segments[0].h0;
  let along = 0;
  for (const seg of segments) {
    seg.h0 -= base;
    seg.h1 -= base;
    seg.start = along;
    along += seg.length;
  }
  const half = (lanes * LANE_W) / 2 + BORDER,
    track: Track = { course, lanes, offsets: offsetsOf(lanes), segments, length: along, bounds: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }, half };
  for (const seg of segments)
    for (let k = 0; k <= 16; k++)
      for (const d of [-half, half]) {
        const p = middle(seg, (k / 16) * seg.length),
          px = p.x - Math.sin(p.heading) * d,
          py = p.y + Math.cos(p.heading) * d;
        const b = track.bounds;
        b.minX = Math.min(b.minX, px);
        b.maxX = Math.max(b.maxX, px);
        b.minY = Math.min(b.minY, py);
        b.maxY = Math.max(b.maxY, py);
      }
  return track;
}
/** A gentle start and end to a climb, so that a ramp has no corner at either end. */
const ease = (f: number) => f * f * (3 - 2 * f);
/** The middle line of a segment `along` units in: where it is and its heading. */
export function middle(seg: Segment, along: number) {
  if (seg.kind === "straight") return { x: seg.x + Math.cos(seg.heading) * along, y: seg.y + Math.sin(seg.heading) * along, heading: seg.heading };
  const sign = Math.sign(seg.turn),
    heading = seg.heading + (sign * along) / seg.radius;
  return { x: seg.cx + Math.sin(heading) * seg.radius * sign, y: seg.cy - Math.cos(heading) * seg.radius * sign, heading };
}
/** How far a lane at offset `d` runs through a segment. */
export const laneLength = (seg: Segment, d: number) => (seg.kind === "straight" ? seg.length : Math.abs(seg.turn) * laneRadius(seg, d));
/** The radius a lane at offset `d` turns on in a curve (the inner lanes the tighter). */
export const laneRadius = (seg: Segment, d: number) => seg.radius - Math.sign(seg.turn) * d;
/** The bank of a curve at fraction `f` through it: eased in and out over its first and last fifth. */
export const bankAt = (seg: Segment, f: number) => seg.bank * Math.min(1, f / 0.2, (1 - f) / 0.2);
/** The grip a car has through a segment: more on a banked curve. */
export const gripOf = (seg: Segment) => GRIP * (1 + BANK_GAIN * Math.tan(seg.bank));
/**
 * The fastest a car may take a segment in a lane at offset `d` without its slot letting go: where the sideways pull of
 * the curve, v² / r, equals the grip (Infinity on a straight).
 */
export const safeSpeed = (seg: Segment, d: number) => (seg.kind === "straight" ? Infinity : Math.sqrt(gripOf(seg) * laneRadius(seg, d)));
export interface Pose {
  x: number;
  y: number;
  /** Height of the track's surface there. */
  h: number;
  heading: number;
  /** Bank (a roll to the inside of the curve) and slope (rising positive). */
  bank: number;
  slope: number;
}
/** The widest track's half width: a banked curve turns about its inner edge there, so no part of it sinks below the table. */
export const WIDEST_HALF = 2 * LANE_W + BORDER;
/** Where a lane at offset `d` is at fraction `f` through segment `seg`. */
export function laneAt(seg: Segment, f: number, d: number): Pose {
  const m = middle(seg, f * seg.length),
    sign = Math.sign(seg.turn),
    bank = bankAt(seg, f) * sign,
    eased = ease(f),
    h = seg.h0 + (seg.h1 - seg.h0) * eased,
    slope = ((seg.h1 - seg.h0) * 6 * f * (1 - f)) / Math.max(1e-6, seg.length);
  // Banked, the track is raised on its outer side about its inner edge (it tilted about its middle, and its inner
  // edge sank into the table: the user saw the track broken there).
  const raised = Math.sin(Math.abs(bank)) * (WIDEST_HALF - sign * d);
  return { x: m.x - Math.sin(m.heading) * d, y: m.y + Math.cos(m.heading) * d, h: h + (seg.kind === "curve" ? raised : 0), heading: m.heading, bank, slope };
}
/** A point of the track's surface `d` across from the middle line, `along` units into a segment. */
export const surfaceAt = (seg: Segment, along: number, d: number) => laneAt(seg, Math.min(1, Math.max(0, along / seg.length)), d);
