import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The marble drop maze, a puzzle of the kind ThinkFun sells as Gravity Maze (its rules of play are followed; its
 * look, cards and towers are not): towers from one fixed kit (`KIT`, our own) are set on a 4 × 4 grid, standing or
 * lying as the challenge says, turned so that a marble dropped into the start rolls by gravity alone into the target.
 *
 * The world is the 4 × 4 grid of cells (`row × 4 + column`, row 0 the far side, north) and its levels, 0 sitting on
 * the grid. A voxel is a cell at a level. Faces are 0 north, 1 east, 2 south (toward the player), 3 west, 4 up,
 * 5 down.
 *
 * A tower is a column of unit cubes moulded together. Its units are written from its foot to its top in the tower's
 * own frame (`Unit`: sides 0–3 as at yaw 0, UP toward its top, DOWN toward its foot), each one of
 * - RAMP (face d): taken from the top face, left by its low side d. Rolling down a ramp resets momentum;
 * - FLAT (face d): a straight channel on the cube's floor between sides d and d + 2, crossed either way;
 * - CORNER (face d): a turning channel on the floor between sides d and d + 1 (its right), crossed either way;
 * - CROSS: a crossing on the floor open on all four sides: the marble goes straight through along the way it came;
 * - HANG: the same crossing mounted upside down under the cube's ceiling (its floor is the cube's top face);
 * - OPEN: an empty cube, air to the marble: whatever enters it falls out through the bottom.
 * A channel (flat, corner, crossing, hanging crossing) is a floor with walls: it carries the marble only while its
 * floor faces down; turned any other way it is air. So a hanging crossing in a tower standing upright is an empty
 * cube to the marble, and a working crossing in a tower stood on its head.
 *
 * A placed tower has a pose (`faceIn`), which the challenge card sets but for its turn:
 * - standing, turned by its yaw (a quarter clockwise seen from above per step);
 * - standing on its head (`inverted`): flipped over about its east–west axis (top and foot, north and south swap)
 *   and then turned by its yaw; its top unit is then lowest;
 * - lying, tipped over onto its side `roll` (that local side then faces down, the opposite one up, its top toward
 *   world side `roll`) and then turned by its yaw, so that it lies along `axisOf` = (roll + yaw) mod 4 (N–S when
 *   that is even, E–W when odd), its units in a row from its foot toward its top, its middle unit (`middle`) over
 *   its anchor cell.
 * Every unit's faces are turned with the pose, and the marble then judges each unit by its world faces:
 * - side to side: one horizontal unit (at most one before a descent or the target: `momentum`);
 * - top to side: a descent, which resets the count;
 * - out through the bottom: a fall (a chute), judged as a fall below;
 * - out through the top, or in by a face with no way through: blocked (`wall`).
 * So by where its rotated faces point (the unit tests hold this table):
 * - RAMP lying: entered from the side its top now faces (along the axis); out to a side across the axis it turns the
 *   marble like a corner that runs one way only; out through the bottom (exit side = roll) it is a chute; out
 *   through the top (exit opposite the roll) it is blocked;
 * - RAMP on its head: still a ramp. Its board is a sloping plate through the cube, and turned over it is a sloping
 *   plate again: it takes the marble from above and sends it out of the side the plate now slopes down to, the side
 *   that was its high back before the flip, as the world sees it (`faceIn(pose, face + 2)`: a north or south ramp
 *   still leaves north or south, an east or west one leaves the other way); entered from a side it is blocked;
 * - FLAT, CORNER, CROSS lying or on their heads: air (their floors face sideways or up);
 * - HANG: air standing or lying; a crossing on its head;
 * - OPEN: air, as always.
 *
 * The marble (`follow`) is dropped into the top of the start (one fixed tower on the start cell whose top unit is a
 * ramp, a brass funnel over it) and falls into that unit. Falling from a voxel, the voxel under it must take it from
 * the top and send it out of a side (a descent), or be the target (from level 1); air or an empty cube is `drop`
 * (more than one level), a unit with no way in from above is `flat`, the grid itself is `floor`. Rolling level into
 * a voxel: off the grid is `off`; the target at level 0 ends the run; air or an empty cube makes it fall; a unit is
 * judged by its faces as above. The run is won when it ends in the target with every tower of the tray placed
 * (else `left`) and with every tower on the board passed (else `unused`, naming one the marble missed), as the
 * product's own rules ask: the marble goes through all the towers. A tower is passed when some unit of it was on
 * the marble's way (`entered`): a ramp it ran down, a channel it crossed, or an empty cube or a channel turned to air
 * that it rolled into and fell out of through the bottom; the start is passed as the marble runs down its top ramp.
 * A tower under another that the marble never reaches, a support under a lying tower among them, is no answer.
 *
 * Building rules (`survey`): towers never overlap or leave the grid; nothing is on or over the start's cell (but
 * its own fixed stack) or the target's; a standing tower stands on the grid or exactly on a standing tower's top,
 * never on a lying one; a lying tower lies at level 1 or above on at least two standing towers' tops that end where
 * it lies (the rest may hang over air), never on a lying tower; a cell holds at most three towers.
 *
 * Moves (`Move`), where a cell is a point 0–15 and tray tower j is the point `CELLS + j`:
 * - `{from: CELLS + j, to: cell}`: tray tower j is put onto `cell` in its posture (a standing one on top of the
 *   cell's stack, a lying one with its middle unit over the cell, at the level its supports end); a lying one is
 *   tried first the way the tray shows it (`trayYaw`, across the view) and then the next quarter turns, so that it
 *   lies the way its supports run;
 * - `{from: cell, to: other}`: the tower on top of `cell` (a lying tower from any of its cells) is carried to
 *   `other`, turned the same way (a lying one on to the next quarter that fits);
 * - `{from: cell, to: cell}`: that tower is turned a quarter clockwise where it is (a lying one about its middle
 *   unit, on to the next quarter that fits; refused when no other way fits);
 * - `{from: cell, to: CELLS + j}`: that tower, tray tower j, goes back to the tray (its yaw to 0);
 * - `{from: CELLS + j or cell, to: put(cell, yaw, posture)}`: put or carried to `cell` turned to `yaw` (the
 *   hint's move; `posture`, 0 standing, 1 on its head, 2 lying, must be the tower's own, which the card sets and
 *   nothing changes);
 * - `{from: -1, to: GO}` (or `to` the start's cell): the marble is dropped. A run that fails is not refused but
 *   made, with `winner` 1 and a `trouble` saying where and why, to be taken back with undo.
 * `extra` is always -1. A placement that breaks a building rule is refused (`play` gives null; `attempt` says why).
 */
export const SIZE = 4,
  CELLS = SIZE * SIZE,
  /** Levels of the world, 0 sitting on the grid. */
  LEVELS = 8,
  /** The most towers a cell holds. */
  STACK = 3;
export const NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3,
  UP = 4,
  DOWN = 5;
export const OPEN = 0,
  RAMP = 1,
  FLAT = 2,
  CORNER = 3,
  CROSS = 4,
  HANG = 5;
export type Kind = 0 | 1 | 2 | 3 | 4 | 5;
export interface Unit {
  kind: Kind;
  /** A ramp's exit side, a flat's one end, a corner's first opening (its second is the next side clockwise); 0 for the rest. */
  face: number;
}
export interface KitTower {
  /** Its letter, as the guide and the card name it. */
  id: string;
  /** Its units from its foot to its top, at yaw 0. */
  units: Unit[];
  /** How many of it the kit holds. */
  count: number;
  /** The colour of its painted cap, and the shade of its wood (neither is red, which is kept for trouble). */
  paint: string;
  wood: string;
}
const u = (kind: Kind, face = 0): Unit => ({ kind, face });
/**
 * The kit, the same in every puzzle: nine towers (heights 5, 4, 4, 3, 3, 2, 2, 1, 1); the target is the felt cup.
 * Our own design; each tower's ramps face set ways relative to each other. A, B and F stand on a foot that is air to
 * the marble, so that it can come down through them onto the tower they are stacked on: F, a lone hanging crossing,
 * whichever way it is turned; A and B with a corner over the foot, which the marble passes first (it is what tells
 * their turn) before it comes back into the foot from the next cell.
 */
export const KIT: KitTower[] = [
  // A: an empty cube at its foot under a corner west–north, a ramp south, an empty cube over it, a ramp east on top
  // (its ramps a quarter apart).
  { id: "A", units: [u(OPEN), u(CORNER, WEST), u(RAMP, SOUTH), u(OPEN), u(RAMP, EAST)], count: 1, paint: "#169a94", wood: "#f3dcb6" },
  // B: a hanging crossing at its foot (air standing) under a corner east–south, a crossing, a ramp north on top.
  { id: "B", units: [u(HANG), u(CORNER, EAST), u(CROSS), u(RAMP, NORTH)], count: 2, paint: "#d65a9a", wood: "#e6b98e" },
  // C: a ramp north at its foot under a hanging crossing, a ramp east on top (a quarter apart).
  { id: "C", units: [u(RAMP, NORTH), u(HANG), u(RAMP, EAST)], count: 2, paint: "#86b324", wood: "#f6e2bf" },
  // D: a flat east–west under a ramp south.
  { id: "D", units: [u(FLAT, EAST), u(RAMP, SOUTH)], count: 2, paint: "#3a68c9", wood: "#edc89a" },
  // E: one ramp west.
  { id: "E", units: [u(RAMP, WEST)], count: 1, paint: "#e9a521", wood: "#f0d2a4" },
  // F: one hanging crossing: an empty cube standing, a crossing on its head.
  { id: "F", units: [u(HANG)], count: 1, paint: "#7a4fae", wood: "#dcb48a" },
];
export const kitOf = (kind: number) => KIT[kind];
export const heightOfKind = (kind: number) => KIT[kind].units.length;
export interface Pose {
  lying: boolean;
  /** Standing on its head (never with `lying`). */
  inverted?: boolean;
  /** The local side a lying tower rests on (0 standing). */
  roll: number;
  yaw: number;
}
export interface Tower extends Pose {
  /** Its kit tower. */
  kind: number;
  /** Its anchor cell (a lying tower's middle unit), or -1 in the tray. */
  at: number;
  /** A standing tower's lowest level, a lying tower's level; -1 in the tray. */
  level: number;
}
export interface Place {
  at: number;
  level: number;
  yaw: number;
}
/** Moves that are not points of the board. */
export const GO = 900,
  PUT = 1000;
/**
 * The way a tray tower is shown turned in the tray, and first tried when it is put: as at yaw 0, but a lying one
 * across the view (east–west), so that seen from above it reads as lying. A lying one put goes on to the next way
 * that fits from there.
 */
export const trayYaw = (t: Pick<Pose, "lying" | "roll">) => (t.lying ? (5 - t.roll) % 4 : 0);
/** A tower's posture as the card shows it: 0 standing, 1 standing on its head, 2 lying. */
export const postureOf = (t: Pick<Pose, "lying" | "inverted">) => (t.lying ? 2 : t.inverted ? 1 : 0);
/** The hint's put: a cell, a yaw and the posture (which must be the tower's own). */
export const put = (cell: number, yaw: number, posture = 0) => PUT + (cell * 4 + (((yaw % 4) + 4) % 4)) * 3 + posture;
export const putOf = (to: number) => {
  const k = to - PUT,
    place = Math.floor(k / 3);
  return { cell: place >> 2, yaw: place & 3, posture: k % 3 };
};
export const slot = (j: number) => CELLS + j;
export const vox = (cell: number, level: number) => level * CELLS + cell;
const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
/** The cell `steps` away from `cell` toward `dir` (backward when negative), or -1 off the grid. */
export function neighbour(cell: number, dir: number, steps = 1) {
  if (cell < 0 || dir > 3) return -1;
  const r = Math.floor(cell / SIZE) + DR[dir] * steps,
    c = (cell % SIZE) + DC[dir] * steps;
  return r < 0 || c < 0 || r >= SIZE || c >= SIZE ? -1 : r * SIZE + c;
}
/** The face opposite. */
export const back = (face: number) => (face === UP ? DOWN : face === DOWN ? UP : (face + 2) % 4);
/** The index of a lying tower's middle unit (the first of the two of a tower of two). */
export const middle = (count: number) => (count - 1) >> 1;
/** The way a lying tower's units run, from its foot toward its top. */
export const axisOf = (pose: Pose) => (pose.roll + pose.yaw) % 4;
/** A unit's local face as it faces in the world for a pose. */
export function faceIn(pose: Pose, local: number): number {
  if (pose.inverted && !pose.lying) {
    if (local === UP) return DOWN;
    if (local === DOWN) return UP;
    return ((local % 2 === 0 ? local + 2 : local) + pose.yaw) % 4;
  }
  if (!pose.lying) return local >= UP ? local : (local + pose.yaw) % 4;
  const b = pose.roll;
  if (local === UP) return (b + pose.yaw) % 4;
  if (local === DOWN) return (b + 2 + pose.yaw) % 4;
  if (local === b) return DOWN;
  if (local === (b + 2) % 4) return UP;
  return (local + pose.yaw) % 4;
}
/** A unit's ways through it in its own frame, as [in, out] faces. */
export function localWays(unit: Unit): [number, number][] {
  const d = unit.face % 4;
  if (unit.kind === RAMP) return [[UP, d]];
  if (unit.kind === FLAT)
    return [
      [d, (d + 2) % 4],
      [(d + 2) % 4, d],
    ];
  if (unit.kind === CORNER)
    return [
      [d, (d + 1) % 4],
      [(d + 1) % 4, d],
    ];
  if (unit.kind === CROSS || unit.kind === HANG) return [0, 1, 2, 3].map((side) => [side, (side + 2) % 4] as [number, number]);
  return [];
}
/** A channel's floor in its own frame (a hanging crossing's is the cube's top), or -1 for a ramp or an empty cube. */
export const floorOf = (unit: Unit) => (unit.kind === HANG ? UP : unit.kind === FLAT || unit.kind === CORNER || unit.kind === CROSS ? DOWN : -1);
/** Whether a unit is air to the marble in a pose: an empty cube, or a channel whose floor does not face down. */
export function airIn(unit: Unit, pose: Pose) {
  if (unit.kind === OPEN) return true;
  const floor = floorOf(unit);
  return floor >= 0 && faceIn(pose, floor) !== DOWN;
}
/** A unit's ways in the world for a pose: the face it leaves by for each face it may be entered by (-1 none). */
export function exitsOf(unit: Unit, pose: Pose): number[] {
  const out = [-1, -1, -1, -1, -1, -1];
  if (airIn(unit, pose)) return out;
  // A ramp turned over is a ramp again, sloping down to what was its high back.
  if (unit.kind === RAMP && pose.inverted && !pose.lying) {
    out[UP] = faceIn(pose, (unit.face + 2) % 4);
    return out;
  }
  for (const [from, to] of localWays(unit)) out[faceIn(pose, from)] = faceIn(pose, to);
  return out;
}
/**
 * The ramp a tower's mark tells of (the arrowhead on the end that shows on top, and on a lying tower on its cap end):
 * standing, its topmost ramp; on its head, its lowest (which is then topmost); lying, the one nearest its cap. By its
 * index from the foot, or -1 for a tower with no ramp (F).
 */
export function markedRamp(t: Pick<Tower, "kind" | "lying" | "inverted">) {
  const units = KIT[t.kind].units,
    ramps = units.flatMap((unit, i) => (unit.kind === RAMP ? [i] : []));
  if (!ramps.length) return -1;
  return !t.lying && t.inverted ? ramps[0] : ramps[ramps.length - 1];
}
/**
 * Where a tower's marked ramp sends the marble in the world, as its pose sets it: a side 0–3, or for a lying tower
 * turned so DOWN (a chute) or UP (blocked); -1 for a tower with no ramp.
 */
export function markExit(t: Pick<Tower, "kind" | "lying" | "inverted" | "roll" | "yaw">) {
  const r = markedRamp(t);
  if (r < 0) return -1;
  const exits = exitsOf(KIT[t.kind].units[r], t);
  return t.lying ? exits[axisOf(t)] : exits[UP];
}
/** What a world way is: one horizontal unit, a descent, a fall out through the bottom, or blocked. */
export function wayKind(from: number, to: number): "level" | "descent" | "fall" | "blocked" {
  if (to < 0 || to === UP || from === DOWN) return "blocked";
  if (to === DOWN) return "fall";
  return from === UP ? "descent" : "level";
}
interface Shape {
  n: number;
  /** By unit: its cell's offset is found from the anchor along `axis` (lying) or its level above the foot (standing). */
  exits: number[][];
  open: boolean[];
  /** A code per unit of how it stands in the world (for telling placements apart). */
  codes: number[];
  /**
   * A code per unit of what it does to the marble: its ways that are not blocked, or air. Two yaws of a tower stood
   * on its head often do the same (its ramps are blocked whichever way they face, its hanging crossing goes all ways).
   */
  ways: number[];
}
const shapes: Shape[] = [];
/** A kit tower's units in a pose, cached. */
export function shapeOf(kind: number, pose: Pose): Shape {
  const key = kind * 24 + (pose.lying ? 8 + (pose.roll % 4) * 4 : pose.inverted ? 4 : 0) + (pose.yaw % 4);
  let known = shapes[key];
  if (!known) {
    const units = KIT[kind].units,
      exits = units.map((unit) => exitsOf(unit, pose));
    const open = units.map((unit) => airIn(unit, pose));
    known = {
      n: units.length,
      exits,
      open,
      codes: exits.map((e) => e.reduce((sum, x, k) => sum + (x + 1) * 7 ** k, 0)),
      ways: exits.map((e, i) => (open[i] ? -1 : e.reduce((sum, x, k) => sum + (wayKind(k, x) === "blocked" ? 0 : x + 1) * 7 ** k, 0))),
    };
    shapes[key] = known;
  }
  return known;
}
export interface Voxel {
  cell: number;
  level: number;
  /** Which unit of the tower it is. */
  unit: number;
}
/** The voxels a tower fills at a place, or null when some of it is off the grid. */
export function voxelsAt(tower: Pick<Tower, "kind" | "lying" | "roll" | "inverted">, at: number, level: number, yaw: number): Voxel[] | null {
  const n = KIT[tower.kind].units.length,
    out: Voxel[] = [];
  if (at < 0) return null;
  const axis = (tower.roll + yaw) % 4,
    mid = middle(n);
  for (let i = 0; i < n; i++) {
    const cell = tower.lying ? neighbour(at, axis, i - mid) : at;
    if (cell < 0) return null;
    out.push({ cell, level: tower.lying ? level : level + (tower.inverted ? n - 1 - i : i), unit: i });
  }
  return out;
}
export const voxelsOf = (t: Tower) => (t.at < 0 ? [] : (voxelsAt(t, t.at, t.level, t.yaw) ?? []));
/** What a tower makes of the world at a place, as text: two placements with the same key are the same. */
export function contentKey(tower: Pick<Tower, "kind" | "lying" | "roll" | "inverted">, at: number, level: number, yaw: number) {
  const voxels = voxelsAt(tower, at, level, yaw);
  if (!voxels) return "";
  const shape = shapeOf(tower.kind, { lying: tower.lying, inverted: tower.inverted, roll: tower.roll, yaw });
  return voxels
    .map((v) => `${vox(v.cell, v.level)}:${shape.codes[v.unit]}`)
    .sort()
    .join(",");
}
/** What a tower makes of the marble's world at a place, as text: placements with the same key work the same. */
export function wayKey(tower: Pick<Tower, "kind" | "lying" | "roll" | "inverted">, at: number, level: number, yaw: number) {
  const voxels = voxelsAt(tower, at, level, yaw);
  if (!voxels) return "";
  const shape = shapeOf(tower.kind, { lying: tower.lying, inverted: tower.inverted, roll: tower.roll, yaw });
  return voxels
    .map((v) => `${vox(v.cell, v.level)}:${shape.ways[v.unit]}`)
    .sort()
    .join(",");
}
/** A tower's kind and posture as text: towers with the same key are interchangeable. */
export const sortKey = (t: Pick<Tower, "kind" | "lying" | "roll" | "inverted">) => `${t.kind}${t.lying ? `L${t.roll}` : t.inverted ? "I" : "S"}`;
/** The yaw of a placement turned to the smallest that makes the same thing. */
export function normalYaw(t: Pick<Tower, "kind" | "lying" | "roll" | "inverted">, at: number, level: number, yaw: number) {
  const key = contentKey(t, at, level, yaw);
  for (let y = 0; y < 4; y++) if (contentKey(t, at, level, y) === key) return y;
  return yaw;
}

export interface State {
  /** The start's cell: the marble is dropped into the top of the fixed stack there. */
  start: number;
  /** The target's cell; its cup sits at level 0. */
  goal: number;
  /** Towers fixed in place from the start (the start's tower among them). */
  given: Tower[];
  /** The towers to place: in the tray (`at` -1) or on the board. */
  tray: Tower[];
  /** Where each tray tower stands in the answer the puzzle was built with (identical towers may be swapped). */
  answer: Place[];
  /** What the last move did, for the table to show it. */
  last: Last | null;
  /** The marble's way when it was dropped last. */
  run: Run | null;
  trouble: Trouble | null;
  winner: Winner;
  ply: number;
  stage: number;
}
export interface Last {
  kind: "put" | "carry" | "back" | "turn" | "go";
  /** The tray tower moved (-1 for the drop). */
  piece: number;
  from: Place | null;
  to: Place | null;
}
export type Fault = "off" | "momentum" | "wall" | "flat" | "drop" | "floor" | "left" | "unused" | "loop";
/** One voxel the marble passed: what it did there, the face it came in by and the one it left by (-1 at the goal). */
export interface Leg {
  cell: number;
  level: number;
  kind: "start" | "ramp" | "flat" | "corner" | "chute" | "fall" | "goal";
  from: number;
  dir: number;
  /** The tower there by its board id (`ids`), or -1 for air. */
  piece: number;
}
export interface Run {
  legs: Leg[];
  fault: Fault | null;
  /** The voxel it went wrong at (null off the grid). */
  at: { cell: number; level: number } | null;
}
export interface Trouble {
  fault: Fault;
  at: { cell: number; level: number } | null;
  /** Tray towers the trouble is about (left in the tray). */
  tray: number[];
  /** The tower on the board the trouble is about by its board id (`ids`; one the marble never entered), or -1. */
  piece: number;
  words: string;
}
/** Board ids: g for given tower g, given.length + j for tray tower j. */
export const ids = (state: Pick<State, "given">) => ({ given: (g: number) => g, tray: (j: number) => state.given.length + j, first: state.given.length });
/** Every tower by its board id (null for a tray tower in the tray). */
export function pieces(state: Pick<State, "given" | "tray">): (Tower | null)[] {
  return [...state.given, ...state.tray.map((t) => (t.at >= 0 ? t : null))];
}
export interface World {
  /** The board id filling each voxel, or -1. */
  owner: Int16Array;
  /** By voxel × 6: the face it leaves by for each face it is entered by (-1 none). */
  exits: Int8Array;
  /** An empty cube (air to the marble). */
  open: Uint8Array;
  /** Whether the tower of a board id lies. */
  lying: boolean[];
}
const VOXELS = CELLS * LEVELS;
export type Refusal = "edge" | "high" | "overlap" | "reserved" | "crowded" | "floating" | "onLying" | "lyingOnLying" | "support" | "under" | "fixed" | "same" | "posture";
const REFUSALS: Record<Refusal, string> = {
  edge: "누운 탑은 판 밖으로 나갈 수 없습니다.",
  high: "그렇게 높이는 쌓을 수 없습니다.",
  overlap: "다른 탑과 겹칩니다.",
  reserved: "출발점과 도착점 위에는 아무것도 놓을 수 없습니다.",
  crowded: "한 칸에는 탑을 세 개까지만 쌓을 수 있습니다.",
  floating: "선 탑은 판 위나 다른 선 탑 위에만 섭니다.",
  onLying: "누운 탑 위에는 아무것도 놓을 수 없습니다.",
  lyingOnLying: "누운 탑은 다른 누운 탑 위에 놓을 수 없습니다.",
  support: "누운 탑은 높이가 같게 끝나는 선 탑 두 개 이상에 걸쳐야 합니다.",
  under: "위에 다른 탑이 있어 들 수 없습니다.",
  fixed: "처음부터 놓인 탑은 움직일 수 없습니다.",
  same: "",
  posture: "탑의 자세(서기·거꾸로 서기·눕기)는 카드대로입니다.",
};
/** Why a placement was refused, in a sentence. */
export const refusalWords = (refusal: Refusal) => REFUSALS[refusal];
/**
 * Lays every tower into the world and checks the building rules; the refusal when one is broken. Towers with ids
 * below `fixedCount` are the given ones (only they may stand on the start's cell).
 */
export function survey(list: (Tower | null)[], start: number, goal: number, fixedCount: number): World | Refusal {
  const owner = new Int16Array(VOXELS).fill(-1),
    exits = new Int8Array(VOXELS * 6).fill(-1),
    open = new Uint8Array(VOXELS),
    lying = list.map((t) => !!t?.lying);
  for (let id = 0; id < list.length; id++) {
    const t = list[id];
    if (!t) continue;
    const voxels = voxelsAt(t, t.at, t.level, t.yaw);
    if (!voxels) return "edge";
    const shape = shapeOf(t.kind, t);
    for (const v of voxels) {
      if (v.level < 0 || v.level >= LEVELS) return "high";
      if (v.cell === goal || (id >= fixedCount && v.cell === start)) return "reserved";
      const i = vox(v.cell, v.level);
      if (owner[i] >= 0) return "overlap";
      owner[i] = id;
      open[i] = shape.open[v.unit] ? 1 : 0;
      for (let f = 0; f < 6; f++) exits[i * 6 + f] = shape.exits[v.unit][f];
    }
  }
  for (let id = 0; id < list.length; id++) {
    const t = list[id];
    if (!t) continue;
    if (!t.lying) {
      if (t.level === 0) continue;
      const below = owner[vox(t.at, t.level - 1)];
      if (below < 0) return "floating";
      if (lying[below]) return "onLying";
    } else {
      if (t.level < 1) return "support";
      let held = 0;
      for (const v of voxelsAt(t, t.at, t.level, t.yaw)!) {
        const below = owner[vox(v.cell, v.level - 1)];
        if (below < 0) continue;
        if (lying[below]) return "lyingOnLying";
        held++;
      }
      if (held < 2) return "support";
    }
  }
  for (let cell = 0; cell < CELLS; cell++) {
    const seen = new Set<number>();
    for (let level = 0; level < LEVELS; level++) {
      const o = owner[vox(cell, level)];
      if (o >= 0) seen.add(o);
    }
    if (seen.size > STACK) return "crowded";
  }
  return { owner, exits, open, lying };
}
/** The world of a state (whose towers always keep the rules). */
export function world(state: Pick<State, "given" | "tray" | "start" | "goal">): World {
  const made = survey(pieces(state), state.start, state.goal, state.given.length);
  if (typeof made === "string") throw new Error(`marble drop: a state breaks a rule (${made})`);
  return made;
}
/** The board id of the tower highest in a cell, or -1. */
export function topIn(w: Pick<World, "owner">, cell: number) {
  for (let level = LEVELS - 1; level >= 0; level--) {
    const o = w.owner[vox(cell, level)];
    if (o >= 0) return o;
  }
  return -1;
}
/** The first free level of a cell: one over the highest thing in it. */
export function heightOf(w: Pick<World, "owner">, cell: number) {
  for (let level = LEVELS - 1; level >= 0; level--) if (w.owner[vox(cell, level)] >= 0) return level + 1;
  return 0;
}
/**
 * Where a tower lands when it is set down at `cell` turned to `yaw` (the tower itself lifted first): a standing one
 * on top of the cell; a lying one with its middle over the cell, at the level of the highest of the stacks under it.
 * Null when a lying one would leave the grid.
 */
export function landing(w: Pick<World, "owner">, t: Pick<Tower, "kind" | "lying" | "roll" | "inverted">, cell: number, yaw: number): Place | null {
  if (!t.lying) return { at: cell, level: heightOf(w, cell), yaw };
  const voxels = voxelsAt(t, cell, 0, yaw);
  if (!voxels) return null;
  let level = 0;
  for (const v of voxels) level = Math.max(level, heightOf(w, v.cell));
  return { at: cell, level, yaw };
}

/** The exit of voxel i for an entry face. */
const exitAt = (w: Pick<World, "exits">, i: number, face: number) => w.exits[i * 6 + face];
/** How the marble goes through a world from the start, as far as it gets. */
export function follow(state: Pick<State, "start" | "goal">, w: World): Run {
  const { start, goal } = state,
    top = heightOf(w, start),
    legs: Leg[] = [{ cell: start, level: top, kind: "start", from: UP, dir: DOWN, piece: -1 }],
    end = (fault: Fault | null, at: Run["at"]): Run => ({ legs, fault, at });
  let cell = start,
    level = top,
    dir = DOWN,
    flats = 0,
    falling = true;
  for (let guard = 0; guard < 6 * VOXELS; guard++) {
    if (falling) {
      // In voxel (cell, level), going down into the one under it.
      if (level === 0) return end("floor", { cell, level: 0 });
      if (cell === goal && level === 1) {
        legs.push({ cell, level: 0, kind: "goal", from: UP, dir: -1, piece: -1 });
        return end(null, { cell, level: 0 });
      }
      const i = vox(cell, level - 1),
        o = w.owner[i];
      if (o < 0 || w.open[i]) return end("drop", { cell, level: level - 1 });
      const out = exitAt(w, i, UP),
        kind = wayKind(UP, out);
      if (kind === "fall") return end("drop", { cell, level: level - 1 });
      if (kind !== "descent") return end("flat", { cell, level: level - 1 });
      legs.push({ cell, level: level - 1, kind: "ramp", from: UP, dir: out, piece: o });
      level--;
      dir = out;
      cell = neighbour(cell, out);
      flats = 0;
      falling = false;
      continue;
    }
    // Rolling level into (cell, level), going `dir`.
    if (cell < 0) return end("off", null);
    if (cell === goal && level === 0) {
      legs.push({ cell, level: 0, kind: "goal", from: back(dir), dir: -1, piece: -1 });
      return end(null, { cell, level: 0 });
    }
    const i = vox(cell, level),
      o = w.owner[i],
      came = back(dir);
    if (o < 0 || w.open[i]) {
      legs.push({ cell, level, kind: "fall", from: came, dir: DOWN, piece: o });
      falling = true;
      continue;
    }
    const out = exitAt(w, i, came),
      kind = wayKind(came, out);
    if (kind === "blocked") return end("wall", { cell, level });
    if (kind === "fall") {
      legs.push({ cell, level, kind: "chute", from: came, dir: DOWN, piece: o });
      falling = true;
      continue;
    }
    if (flats >= 1) return end("momentum", { cell, level });
    legs.push({ cell, level, kind: out === dir ? "flat" : "corner", from: came, dir: out, piece: o });
    flats++;
    dir = out;
    cell = neighbour(cell, out);
  }
  return end("loop", null);
}
const WHY: Record<Fault, string> = {
  off: "구슬이 판 밖으로 굴러 나갔습니다.",
  momentum: "구슬이 경사를 내려온 뒤 수평으로 두 칸을 굴러 힘을 잃었습니다.",
  wall: "구슬이 막힌 벽에 부딪혔습니다.",
  flat: "구슬이 경사가 아닌 칸 위로 떨어졌습니다.",
  drop: "구슬이 한 층보다 더 깊이 떨어졌습니다.",
  floor: "구슬이 판 위로 떨어졌습니다.",
  left: "구슬은 도착 컵에 들어갔지만 아직 놓지 않은 탑이 있습니다.",
  unused: "구슬이 지나가지 않은 탑이 있습니다. 구슬은 모든 탑을 지나서 도착 컵에 들어가야 합니다.",
  loop: "구슬이 같은 곳을 맴돌았습니다.",
};
/** Why a drop failed, in a sentence. */
export const why = (fault: Fault) => WHY[fault];
/** The board ids of the towers the marble entered on a way (some unit of theirs was on it). */
export const entered = (run: Pick<Run, "legs">) => new Set(run.legs.flatMap((leg) => (leg.piece >= 0 ? [leg.piece] : [])));
/**
 * The towers on the board that a way never entered, by board id: placed tray towers first (the player's own), then
 * the fixed ones, each list from the highest down.
 */
export function unentered(state: Pick<State, "given" | "tray">, run: Pick<Run, "legs">): number[] {
  const seen = entered(run),
    top = (t: Tower) => Math.max(...voxelsOf(t).map((v) => v.level)),
    list = pieces(state).flatMap((t, id) => (t && !seen.has(id) ? [{ id, t }] : []));
  const first = ids(state).first;
  return list.sort((a, b) => Number(a.id < first) - Number(b.id < first) || top(b.t) - top(a.t) || a.id - b.id).map((x) => x.id);
}
/**
 * What a drop of the marble comes to: its way, and the trouble (null when it is a win). Home, it still fails while
 * a tower of the tray is left (`left`) or while a tower on the board, fixed or placed, the start's included, was
 * never entered by the marble (`unused`, naming the first of them).
 */
export function judge(state: State): { run: Run; trouble: Trouble | null } {
  const run = follow(state, world(state));
  if (run.fault) return { run, trouble: { fault: run.fault, at: run.at, tray: [], piece: -1, words: why(run.fault) } };
  const left = state.tray.flatMap((t, j) => (t.at < 0 ? [j] : []));
  if (left.length) return { run, trouble: { fault: "left", at: run.at, tray: left, piece: -1, words: why("left") } };
  const missed = unentered(state, run);
  if (missed.length) {
    const id = missed[0],
      t = pieces(state)[id]!,
      first = ids(state).first,
      name = `${KIT[t.kind].id} 탑${id < first ? "(고정)" : ""}`;
    return {
      run,
      trouble: { fault: "unused", at: { cell: t.at, level: t.level }, tray: [], piece: id, words: `구슬이 ${name}을 지나가지 않았습니다. 구슬은 모든 탑을 지나서 도착 컵에 들어가야 합니다.` },
    };
  }
  return { run, trouble: null };
}

/** A cell where tray tower j is the highest thing (a press there takes it up), or -1 while something lies over it. */
export function handle(state: Pick<State, "given" | "tray">, w: Pick<World, "owner">, j: number) {
  const id = ids(state).tray(j);
  for (const v of voxelsOf(state.tray[j])) if (topIn(w, v.cell) === id) return v.cell;
  return -1;
}
/** The tray tower a point names to be lifted: a tray place, or the top tower of a cell. */
function lifted(state: State, w: World, from: number): { j: number } | Refusal | null {
  if (from >= CELLS) {
    const j = from - CELLS;
    return j < state.tray.length && state.tray[j].at < 0 ? { j } : null;
  }
  if (from < 0) return null;
  const top = topIn(w, from);
  if (top < 0) return null;
  const first = ids(state).first;
  if (top < first) return "fixed";
  return { j: top - first };
}
/** The state a move would make, the refusal of a placement that breaks a rule, or null for a move that is not one. */
export function attempt(state: State, move: Move): State | Refusal | null {
  const { from, to } = move;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from === -1) {
    if (to !== GO && to !== state.start) return null;
    const { run, trouble } = judge(state);
    return { ...state, last: { kind: "go", piece: -1, from: null, to: null }, run, trouble, winner: trouble ? 1 : 0, ply: state.ply + 1 };
  }
  const w = world(state),
    taken = lifted(state, w, from);
  if (taken === null || typeof taken === "string") return taken;
  const { j } = taken,
    tower = state.tray[j],
    onBoard = tower.at >= 0,
    own = new Set(voxelsOf(tower).map((v) => v.cell)),
    was: Place | null = onBoard ? { at: tower.at, level: tower.level, yaw: tower.yaw } : null;
  if (onBoard && handle(state, w, j) < 0) return "under";
  const tray = state.tray.map((t) => ({ ...t })),
    bare = world({ ...state, tray: tray.map((t, k) => (k === j ? { ...t, at: -1, level: -1 } : t)) });
  const done = (next: Tower, kind: Last["kind"]): State | Refusal => {
    tray[j] = next;
    const made = survey(pieces({ ...state, tray }), state.start, state.goal, state.given.length);
    if (typeof made === "string") return made;
    return { ...state, tray, last: { kind, piece: j, from: was, to: next.at >= 0 ? { at: next.at, level: next.level, yaw: next.yaw } : null }, run: null, trouble: null, ply: state.ply + 1 };
  };
  /**
   * Sets the tower down at `cell` turned to `yaw`; with `tries` above 1 the next quarter turns are tried in order
   * when that one does not fit, and the first refusal is told if none does.
   */
  const setAt = (cell: number, yaw: number, kind: Last["kind"], tries = 1): State | Refusal | null => {
    if (cell < 0 || cell >= CELLS) return null;
    let first: Refusal | null = null;
    for (let k = 0; k < tries; k++) {
      const place = landing(bare, tower, cell, (yaw + k) % 4);
      if (!place) {
        first ??= "edge";
        continue;
      }
      if (was && contentKey(tower, was.at, was.level, was.yaw) === contentKey(tower, place.at, place.level, place.yaw)) {
        first ??= "same";
        continue;
      }
      const made = done({ ...tower, ...place }, kind);
      if (typeof made !== "string") return made;
      first ??= made;
    }
    return first;
  };
  if (to >= PUT) {
    const p = putOf(to);
    if (p.posture !== postureOf(tower)) return "posture";
    return setAt(p.cell, p.yaw, !onBoard ? "put" : p.cell === tower.at ? "turn" : "carry");
  }
  if (to === CELLS + j) return onBoard ? done({ ...tower, at: -1, level: -1, yaw: 0 }, "back") : null;
  if (to < 0 || to >= CELLS) return null;
  const tries = tower.lying ? 4 : 1;
  if (!onBoard) return setAt(to, trayYaw(tower), "put", tries);
  // A tap on a tower's own cell turns it a quarter where it is (a lying one about its middle, on to the next way
  // that fits); a carry goes to a cell it is not on, turned as it is (a lying one on to the next way that fits).
  if (to === from) {
    const turned = setAt(tower.at, (tower.yaw + 1) % 4, "turn", tower.lying ? 3 : 1);
    return turned;
  }
  if (own.has(to)) return null;
  return setAt(to, tower.yaw, "carry", tries);
}
/** A move of a tower or the drop of the marble; null (and the state left alone) when it may not be made. */
export function play(state: State, move: Move): State | null {
  const next = attempt(state, move);
  return next && typeof next !== "string" ? next : null;
}
/** Why a move is refused, in a sentence for the status line, or null when it is not refused for a rule. */
export function refusal(state: State, move: Move): string | null {
  const next = attempt(state, move);
  return typeof next === "string" && next !== "same" ? refusalWords(next) : null;
}
/** Every move there is (the turned puts of the hint are made by `play` too, but not listed). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [
      { from: -1, to: GO, extra: -1 },
      { from: -1, to: state.start, extra: -1 },
    ],
    w = world(state),
    id = ids(state),
    ok = (move: Move) => {
      if (play(state, move)) out.push(move);
    };
  state.tray.forEach((t, j) => {
    if (t.at < 0) {
      for (let cell = 0; cell < CELLS; cell++) ok({ from: CELLS + j, to: cell, extra: -1 });
      return;
    }
    for (const from of new Set(voxelsOf(t).map((v) => v.cell))) {
      if (topIn(w, from) !== id.tray(j)) continue;
      for (let cell = 0; cell < CELLS; cell++) ok({ from, to: cell, extra: -1 });
      ok({ from, to: CELLS + j, extra: -1 });
    }
  });
  return out;
}

/*
 * The solver: every way to set the tray's towers so that the marble wins, found by following the marble and
 * deciding what fills each voxel it comes to only when it comes there. Since the marble must pass every tower, every
 * tower of the tray is one it meets on its way: none is left to set anywhere else.
 */
export interface Layout {
  start: number;
  goal: number;
  given: Tower[];
}
const RESERVED = -2;
/** The work a count of answers may take (voxels followed), after which it gives up (`info.cut`). */
const BUDGET = 250000;
/**
 * The ways of placing `tray` (towers with their kinds and postures; places ignored) on a layout so that the marble
 * dropped at the start runs into the target through every tower, up to `cap` of them, each as a place per tray
 * tower. Ways that do the same to the marble are one (`wayKey`: identical towers swapped, or a tower on its head
 * turned where its turn changes nothing). The marble is followed from the start; at a voxel nothing has decided yet
 * it is tried as air (rolling in level) and as each unit of each tower left that could take the marble there (the
 * tower is then set so that that unit fills the voxel), the voxels it passed as air being kept clear. It is home
 * when every tower of the tray is set and every tower on the board, fixed or set, has been entered on the way
 * (`met`); every building rule is then checked over the whole board (a tower set floating, or a lying one held by
 * fewer than two, is no answer).
 */
export function solutions(layout: Layout, tray: Pick<Tower, "kind" | "lying" | "roll" | "inverted">[], cap = 2, info?: { cut: boolean }): Place[][] {
  const fixed = layout.given,
    owner = new Int16Array(VOXELS).fill(-1),
    exits = new Int8Array(VOXELS * 6).fill(-1),
    open = new Uint8Array(VOXELS),
    { goal, start } = layout,
    F = fixed.length;
  for (let id = 0; id < F; id++) {
    const t = fixed[id],
      shape = shapeOf(t.kind, t);
    for (const v of voxelsOf(t)) {
      const i = vox(v.cell, v.level);
      owner[i] = id;
      open[i] = shape.open[v.unit] ? 1 : 0;
      for (let f = 0; f < 6; f++) exits[i * 6 + f] = shape.exits[v.unit][f];
    }
  }
  // Identical towers form one group: a group's towers are placed in turn, so that swapping them counts once.
  const groups: { tower: Pick<Tower, "kind" | "lying" | "roll" | "inverted">; members: number[]; places: Place[] }[] = [];
  tray.forEach((t, j) => {
    const key = sortKey(t),
      group = groups.find((g) => sortKey(g.tower) === key);
    if (group) group.members.push(j);
    else groups.push({ tower: { kind: t.kind, lying: t.lying, inverted: !t.lying && !!t.inverted, roll: t.lying ? t.roll : 0 }, members: [j], places: [] });
  });
  const placed: (Tower | null)[] = [],
    found: Place[][] = [],
    seenAnswers = new Set<string>();
  let unplaced = tray.length,
    nextId = F,
    steps = 0;
  /** By board id: how many times the marble's way, as far as it has been followed, is in one of its units. */
  const met = new Int16Array(F + tray.length);
  const towerOf = (id: number): Tower => (id < F ? fixed[id] : placed[id - F]!);
  /** Whether the work allowed has run out (counted, so that the same puzzle is always laid the same way). */
  const cut = () => {
    if (steps > BUDGET) {
      if (info) info.cut = true;
      return true;
    }
    return false;
  };
  const lyingAt = (i: number) => owner[i] >= 0 && towerOf(owner[i]).lying;
  /** Sets a group's next tower at a place, if its voxels are free and nothing already decided rules it out. */
  const place = (g: number, at: number, level: number, yaw: number): boolean => {
    const group = groups[g],
      t = group.tower,
      voxels = voxelsAt(t, at, level, yaw);
    if (!voxels) return false;
    for (const v of voxels) {
      if (v.level < 0 || v.level >= LEVELS || v.cell === goal || v.cell === start) return false;
      if (owner[vox(v.cell, v.level)] !== -1) return false;
    }
    if (!t.lying) {
      if (level > 0) {
        const below = vox(at, level - 1);
        if (owner[below] === RESERVED || lyingAt(below)) return false;
      }
    } else {
      if (level < 1) return false;
      for (const v of voxels) {
        if (lyingAt(vox(v.cell, level - 1))) return false;
        if (level + 1 < LEVELS) {
          const over = vox(v.cell, level + 1);
          if (owner[over] >= 0) return false;
        }
      }
    }
    const shape = shapeOf(t.kind, { ...t, yaw }),
      id = nextId++;
    for (const v of voxels) {
      const i = vox(v.cell, v.level);
      owner[i] = id;
      open[i] = shape.open[v.unit] ? 1 : 0;
      for (let f = 0; f < 6; f++) exits[i * 6 + f] = shape.exits[v.unit][f];
    }
    placed[id - F] = { ...t, at, level, yaw };
    group.places.push({ at, level, yaw });
    unplaced--;
    return true;
  };
  const unplace = (g: number) => {
    const id = --nextId,
      t = placed[id - F]!;
    for (const v of voxelsOf(t)) owner[vox(v.cell, v.level)] = -1;
    placed[id - F] = null;
    groups[g].places.pop();
    unplaced++;
  };
  const record = () => {
    const list: (Tower | null)[] = [...fixed, ...placed.slice(0, nextId - F)];
    if (typeof survey(list, start, goal, F) === "string") return;
    const answer: Place[] = new Array(tray.length);
    for (const group of groups) group.members.forEach((j, k) => (answer[j] = group.places[k]));
    const key = answer
      .map((a, j) => wayKey(tray[j], a.at, a.level, a.yaw))
      .sort()
      .join("|");
    if (seenAnswers.has(key)) return;
    seenAnswers.add(key);
    found.push(answer);
  };
  /**
   * Home: an answer only when every tower of the tray is set and every tower on the board, fixed or set, was entered
   * by the marble on its way here (so none is set off the way, and no support is one it does not pass).
   */
  const home = (): void => {
    if (unplaced) return;
    for (let id = 0; id < nextId; id++) if (!met[id]) return;
    record();
  };
  /** Units of the groups left that could fill a voxel and take the marble so: each tried in turn. */
  const tryUnits = (cell: number, level: number, wanted: (exits: number[], open: boolean) => boolean, then: () => void) => {
    for (let g = 0; g < groups.length && found.length < cap; g++) {
      const group = groups[g];
      if (group.places.length >= group.members.length) continue;
      const t = group.tower,
        n = KIT[t.kind].units.length;
      for (let yaw = 0; yaw < 4 && found.length < cap; yaw++) {
        const shape = shapeOf(t.kind, { ...t, yaw });
        for (let k = 0; k < n && found.length < cap; k++) {
          if (!wanted(shape.exits[k], shape.open[k])) continue;
          let at: number, level0: number;
          if (!t.lying) {
            at = cell;
            level0 = level - (t.inverted ? n - 1 - k : k);
            if (level0 < 0) continue;
          } else {
            at = neighbour(cell, (t.roll + yaw) % 4, middle(n) - k);
            level0 = level;
            if (at < 0) continue;
          }
          if (!place(g, at, level0, yaw)) continue;
          then();
          unplace(g);
        }
      }
    }
  };
  /** The marble rolls level into (cell, level) going `dir`, `flats` horizontal units since the last descent. */
  const enter = (cell: number, level: number, dir: number, flats: number, depth: number): void => {
    if (found.length >= cap || depth > 160 || cell < 0 || ++steps > BUDGET || cut()) return;
    if (cell === goal && level === 0) return home();
    const i = vox(cell, level),
      o = owner[i],
      came = back(dir);
    if (o >= 0) {
      const out = exits[i * 6 + came],
        kind = open[i] ? "fall" : wayKind(came, out);
      if (kind !== "fall" && (kind !== "level" || flats >= 1)) return;
      met[o]++;
      if (kind === "fall") fall(cell, level, depth + 1);
      else enter(neighbour(cell, out), level, out, flats + 1, depth + 1);
      met[o]--;
      return;
    }
    if (o === RESERVED) return fall(cell, level, depth + 1);
    if (cell === start) return;
    // Nothing decided here yet: air, or a unit that lets the marble on.
    if (level >= 1) {
      // Air under a standing tower that would then float is no way.
      const over = level + 1 < LEVELS ? owner[vox(cell, level + 1)] : -1;
      if (!(over >= 0 && !towerOf(over).lying && towerOf(over).level === level + 1)) {
        owner[i] = RESERVED;
        fall(cell, level, depth + 1);
        owner[i] = -1;
      }
    }
    tryUnits(
      cell,
      level,
      (ex, isOpen) => {
        if (isOpen) return level >= 1;
        const kind = wayKind(came, ex[came]);
        return kind === "fall" ? level >= 1 : kind === "level" && flats === 0;
      },
      () => enter(cell, level, dir, flats, depth + 1),
    );
  };
  /** The marble falls from (cell, level) toward the voxel under it. */
  const fall = (cell: number, level: number, depth: number): void => {
    if (found.length >= cap || level === 0) return;
    if (cell === goal && level === 1) return home();
    const i = vox(cell, level - 1),
      o = owner[i];
    if (o >= 0) {
      if (open[i]) return;
      const out = exits[i * 6 + UP];
      if (wayKind(UP, out) !== "descent") return;
      met[o]++;
      enter(neighbour(cell, out), level - 1, out, 0, depth + 1);
      met[o]--;
      return;
    }
    if (o === RESERVED || cell === start) return;
    tryUnits(
      cell,
      level - 1,
      (ex, isOpen) => !isOpen && wayKind(UP, ex[UP]) === "descent",
      () => fall(cell, level, depth + 1),
    );
  };
  let top = 0;
  while (top < LEVELS && owner[vox(start, top)] >= 0) top++;
  fall(start, top, 0);
  return found;
}

/*
 * Laying a puzzle.
 */
export interface Stage {
  /** The start tower's height, from and to (a kit tower of that height whose top unit is a ramp). */
  top: [number, number];
  /** Towers in the tray, from and to. */
  tray: [number, number];
  /** Towers the built way must pass (the start's aside), so that the tray can be chosen among them. */
  passed: number;
  /** Whether a tray tower stands on another tower. */
  stacks: boolean;
  /** Whether lying towers are laid: never, now and then (one), or always (in the tray). */
  lying: "none" | "maybe" | "always";
  /** Whether towers stood on their heads are laid: never, now and then, or always (in the tray). */
  inverted: "none" | "maybe" | "always";
  /** Answers allowed at most (one, or a few on the hardest stage when one costs too long). */
  answers: number;
  /**
   * Where the stage has stacks, how often a build stacks each tower that can be passed so (by its letter): F to fall
   * through (`AIR_FOOT`), the others to be passed twice (`TWICE`). Each build stacks one of them, and the odds are set
   * against how often each comes to a puzzle, so that no one tower is the stacked one in most puzzles.
   */
  stackers: Record<string, number>;
}
/**
 * The tower the marble may fall through, foot and all, onto a stack (`build`): F standing, one hanging crossing, air
 * to the marble whichever way it is turned. A tower of more units passed only through its foot could be turned any
 * way, so the others are passed twice (`TWICE`).
 */
const AIR_FOOT = { kind: KIT.findIndex((k) => k.units.length === 1 && k.units[0].kind === HANG), inverted: false };
/**
 * Towers the marble may pass twice when stacked (`build`): standing, the foot is air to the marble and the unit over
 * it a corner, which sends the marble on one way only whichever way it comes in, so that the tower's turn is told by
 * it (A and B).
 */
const TWICE = KIT.flatMap((k, kind) => (k.units.length > 1 && airIn(k.units[0], { lying: false, roll: 0, yaw: 0 }) && k.units[1].kind === CORNER ? [kind] : []));
/** The four stages. */
export const STAGES: Stage[] = [
  { top: [2, 3], tray: [2, 2], passed: 2, stacks: false, lying: "none", inverted: "none", answers: 1, stackers: {} },
  { top: [3, 4], tray: [3, 3], passed: 4, stacks: true, lying: "none", inverted: "none", answers: 1, stackers: { A: 1, B: 0.58, F: 1 } },
  { top: [3, 4], tray: [3, 4], passed: 4, stacks: true, lying: "maybe", inverted: "maybe", answers: 1, stackers: { A: 2.5, B: 0.8, F: 1 } },
  // A tower 5 high is passed twice only from its foot at level 1, where the lying tower leaves no room: B and F.
  { top: [3, 4], tray: [4, 4], passed: 4, stacks: true, lying: "always", inverted: "maybe", answers: 1, stackers: { B: 1, F: 1 } },
];
/** The stage a variant names (1 to 4). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const between = ([lo, hi]: [number, number], random: Random) => lo + Math.min(hi - lo, Math.floor(random() * (hi - lo + 1)));
/** A weighted random order of options. */
function ordered<X extends { weight: number }>(options: X[], random: Random): X[] {
  const pool = [...options],
    out: X[] = [];
  while (pool.length) {
    let roll = random() * pool.reduce((s, o) => s + o.weight, 0),
      k = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) {
        k = i;
        break;
      }
    }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}
/**
 * Builds a way forward from the start with the kit: the marble is followed, and at each voxel nothing has decided
 * it is let through as air or met by a kit tower set so that one of its units takes it on: standing on the cell's
 * stack; lying, laid before its supports, which must then be towers the marble meets under it later; or stacked, as
 * the build's own `stackWith` says (one tower a build, so that the stage's `stackers` set how often each is the one):
 * F stood on a ramp's column, the marble falling through it onto the ramp, or A or B stood so and passed twice, first
 * by its corner and then, back from the next cell, through its foot (`twiceOptions`). A tower may also be stood under
 * the voxel first, to raise the stack, if the marble can still come back to it. Every tower laid is one the marble
 * passes (`reachable` cuts a way off as soon as one cannot be), so the way passes every tower on the board. It ends in
 * the target, laid where the marble comes down. Null when the search runs out.
 */
function build(spec: Stage, random: Random): { towers: Tower[]; start: number; goal: number; passed: Set<number> } | null {
  const owner = new Int16Array(VOXELS).fill(-1),
    exits = new Int8Array(VOXELS * 6).fill(-1),
    open = new Uint8Array(VOXELS),
    towers: Tower[] = [],
    left = KIT.map((k) => k.count),
    passed: number[] = [],
    allowLying = spec.lying !== "none",
    wantLying = spec.lying === "always" || (spec.lying === "maybe" && random() < 0.8),
    allowInverted = spec.inverted !== "none",
    // A liking for each kit tower of this build's own, so that the puzzles do not all use the same few.
    prefer = KIT.map(() => 0.15 + 1.7 * random() ** 1.5),
    wantInverted = spec.inverted === "always" || (spec.inverted === "maybe" && random() < 0.4),
    // The tower this build stacks (`Stage.stackers`): F to fall through, or one to pass twice.
    stackWith = spec.stacks ? ordered(Object.entries(spec.stackers).map(([id, weight]) => ({ kind: KIT.findIndex((k) => k.id === id), weight })), random)[0].kind : -1,
    through = stackWith === AIR_FOOT.kind;
  let goal = -1,
    nodes = 0,
    lyingUsed = 0,
    laying = true;
  const start = Math.floor(random() * CELLS);
  /**
   * The first free level of a cell's stack counted up from the grid: where a standing tower set there stands. A
   * lying tower laid before its supports may lie higher over the gap; the marble's air stops the count.
   */
  const groundAt = (cell: number) => {
    let level = 0;
    while (level < LEVELS && owner[vox(cell, level)] >= 0) level++;
    return level;
  };
  const countIn = (cell: number) => {
    const seen = new Set<number>();
    for (let level = 0; level < LEVELS; level++) if (owner[vox(cell, level)] >= 0) seen.add(owner[vox(cell, level)]);
    return seen.size;
  };
  const columnFree = (cell: number) => {
    for (let level = 0; level < LEVELS; level++) if (owner[vox(cell, level)] >= 0) return false;
    return true;
  };
  /** Lays a tower if its voxels are free (or are the marble's air, `replace`, which only an empty cube may fill). */
  const lay = (t: Tower, replace = -1): boolean => {
    const voxels = voxelsAt(t, t.at, t.level, t.yaw);
    if (!voxels || left[t.kind] <= 0) return false;
    const shape = shapeOf(t.kind, t);
    for (const v of voxels) {
      if (v.level >= 6 || v.cell === goal || (v.cell === start && !laying)) return false;
      const i = vox(v.cell, v.level);
      if (owner[i] === RESERVED && i === replace && shape.open[v.unit]) continue;
      if (owner[i] !== -1) return false;
    }
    const id = towers.length;
    for (const v of voxels) {
      const i = vox(v.cell, v.level);
      owner[i] = id;
      open[i] = shape.open[v.unit] ? 1 : 0;
      for (let f = 0; f < 6; f++) exits[i * 6 + f] = shape.exits[v.unit][f];
    }
    towers.push(t);
    left[t.kind]--;
    return true;
  };
  const unlay = (replaced = -1) => {
    const t = towers.pop()!;
    for (const v of voxelsOf(t)) {
      const i = vox(v.cell, v.level);
      owner[i] = i === replaced ? RESERVED : -1;
    }
    left[t.kind]++;
  };
  /** Kit kinds left, at random. */
  const kinds = () =>
    shuffled(
      KIT.map((_, k) => k).filter((k) => left[k] > 0),
      random,
    );
  /** Whether a standing tower may go on a cell's stack now (it ends in a standing tower or the grid). */
  const standable = (cell: number) => {
    if (cell === start || cell === goal || countIn(cell) >= STACK) return false;
    const h = groundAt(cell);
    return h === 0 || !towers[owner[vox(cell, h - 1)]].lying;
  };
  /** Every lying placement of a kit tower in which unit k fills (cell, level). */
  const lyingAround = (cell: number, level: number) => {
    const out: { t: Tower; unit: number }[] = [];
    if (!allowLying || lyingUsed >= 1 || level < 1) return out;
    for (const kind of kinds()) {
      const n = KIT[kind].units.length;
      if (n < 2) continue;
      for (let roll = 0; roll < 4; roll++)
        for (let yaw = 0; yaw < 4; yaw++)
          for (let k = 0; k < n; k++) {
            const at = neighbour(cell, (roll + yaw) % 4, middle(n) - k);
            if (at < 0) continue;
            out.push({ t: { kind, lying: true, roll, at, level, yaw }, unit: k });
          }
    }
    return shuffled(out, random);
  };
  /**
   * Lays a lying tower where the marble meets it, before its supports: they are the towers the marble meets later
   * under it (a support it did not pass would be a tower off the way), and the way is home only once two of them hold
   * it (`supported`). The ids it laid, or null.
   */
  const layLying = (t: Tower): number[] | null => {
    const voxels = voxelsAt(t, t.at, t.level, t.yaw);
    if (!voxels || t.level < 1) return null;
    for (const v of voxels) {
      if (v.cell === start || v.cell === goal || countIn(v.cell) >= STACK) return null;
      const below = owner[vox(v.cell, t.level - 1)];
      if (below >= 0 && towers[below].lying) return null;
      if (t.level + 1 < LEVELS && owner[vox(v.cell, t.level + 1)] !== -1) return null;
    }
    if (!lay(t)) return null;
    lyingUsed++;
    return [towers.length - 1];
  };
  /** How many of a lying tower's cells have a standing tower ending under it. */
  const held = (t: Tower) => voxelsOf(t).filter((v) => owner[vox(v.cell, t.level - 1)] >= 0).length;
  /**
   * Whether every lying tower may still get its two supports from the marble's way at (cell, level) on: cells under it
   * whose stack can still be met and raised to end under it by one tower of the kit left.
   */
  const supportable = (cell: number, level: number) => {
    const r = Math.floor(cell / SIZE),
      c = cell % SIZE,
      tallest = Math.max(0, ...KIT.map((k, kind) => (left[kind] > 0 ? k.units.length : 0)));
    for (const t of towers) {
      if (!t.lying) continue;
      let have = 0,
        could = 0;
      for (const v of voxelsOf(t)) {
        if (owner[vox(v.cell, t.level - 1)] >= 0) {
          have++;
          continue;
        }
        const g = groundAt(v.cell);
        if (g > level || t.level - g > tallest || countIn(v.cell) >= STACK) continue;
        let free = true;
        for (let l = g; l < t.level; l++) if (owner[vox(v.cell, l)] !== -1) free = false;
        const d = Math.abs(Math.floor(v.cell / SIZE) - r) + Math.abs((v.cell % SIZE) - c);
        if (free && d <= 2 * (level - g) + 2) could++;
      }
      if (have + could < 2) return false;
    }
    return true;
  };
  const undo = (count: number, wasLying: boolean) => {
    for (let k = 0; k < count; k++) unlay();
    if (wasLying) lyingUsed--;
  };
  /** Enough has been passed for the stage: the tray's count, and what the stage wants among them. */
  const enough = () => {
    const ids = new Set(passed);
    // Every tower laid is one the marble passes (a support it does not pass is no answer).
    for (let i = 0; i < towers.length; i++) if (!ids.has(i)) return false;
    const loose = towers.map((_, i) => i).filter((i) => ids.has(i) && towers[i].at !== start);
    if (loose.length < spec.passed) return false;
    if (spec.stacks && !loose.some((i) => !towers[i].lying && towers[i].level > 0)) return false;
    if (wantLying && !loose.some((i) => towers[i].lying)) return false;
    if (wantInverted && !loose.some((i) => towers[i].inverted)) return false;
    if (!spec.stacks && towers.some((t) => !t.lying && t.level > 0 && t.at !== start)) return false;
    if (towers.some((t) => t.lying && held(t) < 2)) return false;
    return true;
  };
  const meet = (id: number) => passed.push(id);
  /**
   * Stacks the marble passes twice (`TWICE`): the upper tower stands on a stack whose top is a ramp (there already,
   * or a tower set there now, standing or on its head), its foot (at `foot`) air to the marble; the marble rolls in by
   * `came` into the corner over the foot, which sends it into the next cell; there a ramp one level down (there
   * already, or a tower set there now) sends it back into the foot, and through the foot it falls onto the stack's
   * ramp and rolls on. So the upper tower's turn matters, as it would not for a tower the marble only fell through.
   * The options are added to `options`.
   */
  const twiceOptions = (cell: number, foot: number, came: number, options: { weight: number; go: () => boolean }[], depth: number) => {
    const h = groundAt(cell);
    if (foot < 1 || cell === start || !standable(cell) || h > foot) return;
    const stacked = towers.some((t, id) => !t.lying && t.level > 0 && t.at !== start && passed.includes(id)),
      lowers: { kind: number; yaw: number; inverted: boolean }[] = [];
    if (h === foot) {
      const below = vox(cell, foot - 1),
        out = exits[below * 6 + UP];
      if (owner[below] >= 0 && !open[below] && wayKind(UP, out) === "descent" && neighbour(cell, out) >= 0) lowers.push({ kind: -1, yaw: 0, inverted: false });
    } else if (countIn(cell) + 2 <= STACK)
      for (const kind of kinds()) {
        const n = KIT[kind].units.length;
        if (h + n !== foot) continue;
        // A tower whose top is a ramp, standing or on its head.
        for (const inverted of wantInverted ? [false, true] : [false])
          for (let yaw = 0; yaw < 4; yaw++) {
            const shape = shapeOf(kind, { lying: false, inverted, roll: 0, yaw }),
              top = inverted ? 0 : n - 1,
              out = shape.exits[top][UP];
            if (!shape.open[top] && wayKind(UP, out) === "descent" && neighbour(cell, out) >= 0) lowers.push({ kind, yaw, inverted });
          }
      }
    for (const upper of TWICE) {
      if (upper !== stackWith || left[upper] <= 0 || foot + KIT[upper].units.length > 6) continue;
      for (const lower of lowers)
        for (let yaw = 0; yaw < 4; yaw++) {
          const d = shapeOf(upper, { lying: false, roll: 0, yaw }).exits[1][came],
            n = neighbour(cell, d);
          if (d < 0 || d > 3 || n < 0 || n === start) continue;
          const turn = vox(n, foot + 1),
            catcher = vox(n, foot);
          if (!(owner[turn] === -1 || (owner[turn] >= 0 && open[turn]))) continue;
          if (owner[catcher] >= 0 ? open[catcher] || exits[catcher * 6 + UP] !== back(d) : owner[catcher] !== -1) continue;
          options.push({
            // Taken as soon as it is offered: later the marble is seldom high enough.
            weight: (stacked ? 0.4 : 60) * prefer[upper] * (lower.kind >= 0 ? prefer[lower.kind] * (lower.inverted ? 4 : 1) : 1),
            go: () => twice(cell, foot, upper, yaw, d, lower, depth),
          });
        }
    }
  };
  const twice = (cell: number, foot: number, upper: number, yaw: number, d: number, lower: { kind: number; yaw: number; inverted: boolean }, depth: number): boolean => {
    const n = neighbour(cell, d),
      turn = vox(n, foot + 1),
      catcher = vox(n, foot),
      h = groundAt(cell);
    // What each tower laid here filled of the marble's air, to be given back when it is taken up.
    const filled: number[] = [];
    let reserved = false;
    const undoAll = () => {
      while (filled.length) unlay(filled.pop());
      if (reserved) owner[turn] = -1;
      return false;
    };
    if (lower.kind >= 0) {
      if (!lay({ kind: lower.kind, lying: false, inverted: lower.inverted, roll: 0, at: cell, level: h, yaw: lower.yaw })) return false;
      filled.push(-1);
    }
    const xId = owner[vox(cell, foot - 1)];
    if (!lay({ kind: upper, lying: false, roll: 0, at: cell, level: foot, yaw })) return undoAll();
    filled.push(-1);
    const uId = towers.length - 1;
    reserved = owner[turn] === -1;
    if (reserved) owner[turn] = RESERVED;
    // The ramp one level down in the next cell: there already, or a tower set there now.
    let yId = owner[catcher];
    if (yId < 0) {
      const hn = groundAt(n);
      if (!standable(n) || hn > foot) return undoAll();
      // Standing or on its head (that first, now and then, where the stage wants a tower on its head).
      const postures = !wantInverted ? [false] : random() < 0.6 ? [true, false] : [false, true];
      for (const kind of kinds())
        for (const inverted of postures) {
          const len = KIT[kind].units.length,
            k0 = foot - hn,
            k = inverted ? len - 1 - k0 : k0;
          if (k0 >= len || yId >= 0) continue;
          for (const yYaw of shuffled([0, 1, 2, 3], random)) {
            const shape = shapeOf(kind, { lying: false, inverted, roll: 0, yaw: yYaw });
            if (shape.open[k] || shape.exits[k][UP] !== back(d)) continue;
            if (lay({ kind, lying: false, inverted, roll: 0, at: n, level: hn, yaw: yYaw }, reserved ? turn : -1)) {
              filled.push(reserved ? turn : -1);
              yId = towers.length - 1;
              break;
            }
          }
        }
      if (yId < 0) return undoAll();
    }
    const e = exits[vox(cell, foot - 1) * 6 + UP],
      // The towers passed on the way: the upper one, an empty cube it may fall through by the next cell, the ramp
      // there, the upper one again and the stack's ramp.
      met = [uId, ...(owner[turn] >= 0 && owner[turn] !== yId ? [owner[turn]] : []), yId, xId];
    for (const id of met) meet(id);
    if (roll(neighbour(cell, e), foot - 1, e, 0, depth + 1)) return true;
    passed.length -= met.length;
    return undoAll();
  };
  /**
   * Whether the way can still end well from the voxel (cell, level) the marble comes to: every tower laid that it has
   * not passed yet (one raised under another) must have a unit it can still reach, and every lying tower its supports.
   * The marble only goes down, and between two levels it moves at most two cells (a ramp's exit and one horizontal
   * unit), so a unit above it, or further away than its levels allow, is out of reach.
   */
  const reachable = (cell: number, level: number) => {
    if (lyingUsed && !supportable(cell, level)) return false;
    const ids = new Set(passed);
    if (ids.size === towers.length) return true;
    const r = Math.floor(cell / SIZE),
      c = cell % SIZE;
    for (let i = 0; i < towers.length; i++) {
      if (ids.has(i)) continue;
      let ok = false;
      for (const v of voxelsOf(towers[i])) {
        if (v.level > level) continue;
        const d = Math.abs(Math.floor(v.cell / SIZE) - r) + Math.abs((v.cell % SIZE) - c);
        if (d <= 2 * (level - v.level) + 2) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  };
  /** The marble rolls level into (cell, level) going `dir`. */
  const roll = (cell: number, level: number, dir: number, flats: number, depth: number): boolean => {
    if (++nodes > 800 || depth > 60 || cell < 0 || !reachable(cell, level)) return false;
    const i = vox(cell, level),
      o = owner[i],
      came = back(dir);
    if (o >= 0) {
      meet(o);
      let ok = false;
      if (open[i]) ok = fall(cell, level, depth + 1);
      else {
        const out = exits[i * 6 + came],
          kind = wayKind(came, out);
        if (kind === "fall") ok = fall(cell, level, depth + 1);
        else if (kind === "level" && flats === 0) ok = roll(neighbour(cell, out), level, out, 1, depth + 1);
      }
      if (!ok) passed.pop();
      return ok;
    }
    if (o === RESERVED) return fall(cell, level, depth + 1);
    if (cell === start) return false;
    type Option = { weight: number; go: () => boolean };
    const options: Option[] = [];
    // Home: at level 0 on a cell nothing stands on.
    if (level === 0 && goal < 0 && columnFree(cell) && enough())
      options.push({
        weight: 6,
        go: () => {
          goal = cell;
          return true;
        },
      });
    if (level >= 1)
      options.push({
        weight: 1.2,
        go: () => {
          owner[i] = RESERVED;
          if (fall(cell, level, depth + 1)) return true;
          owner[i] = -1;
          return false;
        },
      });
    const h = groundAt(cell);
    if (standable(cell) && h <= level)
      for (const kind of kinds())
        for (const inverted of allowInverted ? [false, true] : [false]) {
          const n = KIT[kind].units.length;
          for (let yaw = 0; yaw < 4; yaw++) {
            const shape = shapeOf(kind, { lying: false, inverted, roll: 0, yaw }),
              k0 = level - h,
              k = inverted ? n - 1 - k0 : k0;
            if (k0 >= n) {
              if (inverted) continue;
              // A tower to raise the stack under the voxel, the marble then met by what goes on it.
              if (spec.stacks && yaw === 0)
                options.push({
                  weight: 0.35,
                  go: () => {
                    if (!lay({ kind, lying: false, roll: 0, at: cell, level: h, yaw: Math.floor(random() * 4) })) return false;
                    if (roll(cell, level, dir, flats, depth + 1)) return true;
                    unlay();
                    return false;
                  },
                });
              continue;
            }
            const ex = shape.exits[k],
              way = shape.open[k] ? "air" : wayKind(came, ex[came]);
            if (way === "air" ? level < 1 : way === "fall" ? level < 1 : way !== "level" || flats > 0) continue;
            // Stacks only where the stage has them.
            if (!spec.stacks && h > 0) continue;
            // A tower all air so posed (F standing) does nothing the marble needs: it is only ever a filler. One
            // the marble only falls out of through its foot could be turned any way (the stacks of `twice` and the
            // through-foot one below are the ways to pass a tower so).
            if (shape.open.every(Boolean) || (way === "air" && k0 === 0)) continue;
            options.push({
              weight: (way === "level" ? 1.6 : way === "fall" ? 1.2 : 0.9) * (inverted ? (wantInverted ? 4 : 0.6) : 1) * prefer[kind],
              go: () => {
                if (!lay({ kind, lying: false, inverted, roll: 0, at: cell, level: h, yaw })) return false;
                meet(towers.length - 1);
                const ok = way === "level" ? roll(neighbour(cell, ex[came]), level, ex[came], 1, depth + 1) : fall(cell, level, depth + 1);
                if (ok) return true;
                passed.pop();
                unlay();
                return false;
              },
            });
          }
        }
    // F (`AIR_FOOT`), whose one cube is air to the marble, stood on a ramp's column: the marble rolls
    // into its foot and falls onto the ramp under it, so that both towers of the stack are passed.
    if (spec.stacks && through && level >= 1 && standable(cell) && h <= level) {
      const stacked = towers.some((t, id) => !t.lying && t.level > 0 && t.at !== start && passed.includes(id)),
        uppers = [AIR_FOOT].filter((u) => left[u.kind] > 0 && level + KIT[u.kind].units.length <= 6);
      const lowers: { kind: number; yaw: number }[] = [];
      if (h === level) {
        const below = vox(cell, level - 1),
          out = exits[below * 6 + UP];
        if (owner[below] >= 0 && !open[below] && wayKind(UP, out) === "descent" && neighbour(cell, out) >= 0 && countIn(cell) < STACK) lowers.push({ kind: -1, yaw: 0 });
      } else if (countIn(cell) + 2 <= STACK)
        for (const kind of kinds()) {
          const units = KIT[kind].units,
            topUnit = units[units.length - 1];
          if (h + units.length !== level || topUnit.kind !== RAMP) continue;
          for (let yaw = 0; yaw < 4; yaw++) if (neighbour(cell, (topUnit.face + yaw) % 4) >= 0) lowers.push({ kind, yaw });
        }
      for (const upper of uppers)
        for (const lower of lowers)
          options.push({
            weight: (stacked ? 0.4 : 3) * (lower.kind >= 0 ? prefer[lower.kind] : 1) * (upper.inverted ? (wantInverted ? 2 : 0.5) : 1),
            go: () => {
              if (lower.kind >= 0 && !lay({ kind: lower.kind, lying: false, roll: 0, at: cell, level: h, yaw: lower.yaw })) return false;
              if (!lay({ kind: upper.kind, lying: false, inverted: upper.inverted, roll: 0, at: cell, level, yaw: Math.floor(random() * 4) })) {
                if (lower.kind >= 0) unlay();
                return false;
              }
              meet(towers.length - 1);
              if (fall(cell, level, depth + 1)) return true;
              passed.pop();
              unlay();
              if (lower.kind >= 0) unlay();
              return false;
            },
          });
    }
    // A stack passed twice (`twice`): the marble rolls into the corner over a tower's empty foot.
    if (spec.stacks && flats === 0) twiceOptions(cell, level - 1, came, options, depth);
    for (const { t, unit } of lyingAround(cell, level)) {
      const shape = shapeOf(t.kind, t),
        ex = shape.exits[unit],
        way = shape.open[unit] ? "air" : wayKind(came, ex[came]);
      if (way === "blocked" || way === "descent") continue;
      if (way === "level" && flats > 0) continue;
      options.push({
        weight: (wantLying ? 3 : 0.5) * prefer[t.kind],
        go: () => {
          const laid = layLying(t);
          if (!laid) return false;
          meet(towers.length - 1);
          // Level on along it or across it; or down through an empty cube or a chute onto what will hold it.
          const ok = way === "level" ? roll(neighbour(cell, ex[came]), level, ex[came], 1, depth + 1) : fall(cell, level, depth + 1);
          if (ok) return true;
          passed.pop();
          undo(laid.length, true);
          return false;
        },
      });
      if (options.length > 60) break;
    }
    for (const option of ordered(options, random)) if (option.go()) return true;
    return false;
  };
  /** The marble falls from (cell, level) into the voxel under it. */
  const fall = (cell: number, level: number, depth: number): boolean => {
    if (++nodes > 800 || level === 0 || !reachable(cell, level - 1)) return false;
    const i = vox(cell, level - 1),
      o = owner[i];
    if (cell === goal && level === 1) return true;
    if (o >= 0) {
      if (open[i]) return false;
      const out = exits[i * 6 + UP];
      if (wayKind(UP, out) !== "descent") return false;
      meet(o);
      if (roll(neighbour(cell, out), level - 1, out, 0, depth + 1)) return true;
      passed.pop();
      return false;
    }
    if (o === RESERVED || cell === start) return false;
    type Option = { weight: number; go: () => boolean };
    const options: Option[] = [],
      here = vox(cell, level),
      overAir = owner[here] === RESERVED;
    if (level === 1 && goal < 0 && cell !== start && enough() && (overAir || owner[here] === -1) && columnFree(cell))
      options.push({
        weight: 6,
        go: () => {
          goal = cell;
          return true;
        },
      });
    const h = groundAt(cell);
    if (standable(cell) && h <= level - 1)
      for (const kind of kinds())
        for (const inverted of allowInverted ? [false, true] : [false]) {
          const n = KIT[kind].units.length,
            k0 = level - 1 - h,
            k = inverted ? n - 1 - k0 : k0;
          for (let yaw = 0; yaw < 4; yaw++) {
            if (k0 >= n) {
              if (spec.stacks && yaw === 0 && !inverted)
                options.push({
                  weight: 0.35,
                  go: () => {
                    if (!lay({ kind, lying: false, roll: 0, at: cell, level: h, yaw: Math.floor(random() * 4) })) return false;
                    if (fall(cell, level, depth + 1)) return true;
                    unlay();
                    return false;
                  },
                });
              continue;
            }
            const shape = shapeOf(kind, { lying: false, inverted, roll: 0, yaw }),
              out = shape.exits[k][UP];
            if (shape.open[k] || wayKind(UP, out) !== "descent") continue;
            if (!spec.stacks && h > 0) continue;
            // Where it rolls on should be on the grid and not straight back into the start.
            const next = neighbour(cell, out);
            if (next < 0) continue;
            options.push({
              weight: (n > k0 + 1 ? 1.4 : 1) * prefer[kind] * (inverted ? (wantInverted ? 4 : 0.6) : 1),
              go: () => {
                if (!lay({ kind, lying: false, inverted, roll: 0, at: cell, level: h, yaw }, overAir ? here : -1)) return false;
                meet(towers.length - 1);
                if (roll(next, level - 1, out, 0, depth + 1)) return true;
                passed.pop();
                unlay(overAir ? here : -1);
                return false;
              },
            });
          }
        }
    for (const { t, unit } of lyingAround(cell, level - 1)) {
      const shape = shapeOf(t.kind, t),
        out = shape.exits[unit][UP];
      if (shape.open[unit] || wayKind(UP, out) !== "descent") continue;
      options.push({
        weight: (wantLying ? 3 : 0.5) * prefer[t.kind],
        go: () => {
          const laid = layLying(t);
          if (!laid) return false;
          meet(towers.length - 1);
          if (roll(neighbour(cell, out), level - 1, out, 0, depth + 1)) return true;
          passed.pop();
          undo(laid.length, true);
          return false;
        },
      });
      if (options.length > 60) break;
    }
    for (const option of ordered(options, random)) if (option.go()) return true;
    return false;
  };
  // The start: one tower whose top unit is a ramp out onto the grid (a tower under it would be one the marble never
  // enters).
  const top = between(spec.top, random);
  const stacks: number[][] = [];
  for (let a = 0; a < KIT.length; a++) if (KIT[a].units.length === top) stacks.push([a]);
  for (const chosen of shuffled(stacks, random)) {
    const topKind = chosen[chosen.length - 1],
      topUnit = KIT[topKind].units[KIT[topKind].units.length - 1];
    if (topUnit.kind !== RAMP) continue;
    for (const yaw of shuffled([0, 1, 2, 3], random)) {
      const exit = (topUnit.face + yaw) % 4;
      if (neighbour(start, exit) < 0) continue;
      let level = 0;
      for (let k = 0; k < chosen.length; k++) {
        lay({ kind: chosen[k], lying: false, roll: 0, at: start, level, yaw: k === chosen.length - 1 ? yaw : Math.floor(random() * 4) });
        level += KIT[chosen[k]].units.length;
      }
      laying = false;
      if (fall(start, level, 0) && goal >= 0) return { towers, start, goal, passed: new Set(passed) };
      for (let k = 0; k < chosen.length; k++) unlay();
      return null;
    }
  }
  return null;
}
/**
 * A puzzle of a stage: a way is built with the kit, passing every tower it lays; some of them go into the tray as the
 * stage counts them (a stacked one, and a lying one where the stage has it) and the rest stay fixed; while the solver finds more ways
 * to set the tray than the stage allows, a tower the other way sets differently is fixed too, and when the tray grows
 * too small another choice is tried, then another way built. So that a puzzle always comes (some runs of random
 * numbers lay one ambiguous way after another), the search gives way by its count of tries: after `EASE[0]` it
 * allows a second answer, after `EASE[1]` a third, after `EASE[2]` a tray one tower smaller. A weak source of
 * random numbers (a test's simple generator) can also keep failing the same way, so after `MIX` tries the numbers
 * are stirred through a generator of its own, seeded from the source (the same source still lays the same puzzle).
 */
export const EASE = [60, 200, 600],
  MIX = 100;
/** A small generator of good quality from one number (mulberry32). */
function stirred(seed: number): Random {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createGame(stage = 1, source: Random = cryptoRandom): State {
  const k = stageOf(stage),
    spec = STAGES[k - 1];
  let random = source;
  for (let tries = 0; ; tries++) {
    if (tries === MIX) random = stirred(Math.floor(source() * 4294967296) ^ 0x9e3779b9);
    const answers = spec.answers + (tries >= EASE[0] ? 1 : 0) + (tries >= EASE[1] ? 1 : 0),
      least = Math.max(1, spec.tray[0] - (tries >= EASE[2] ? 1 : 0));
    const built = build(spec, random);
    if (!built) continue;
    const { towers, start, goal, passed } = built;
    // What rests on what: a fixed tower may never rest on one of the tray's.
    const over = towers.map(() => [] as number[]),
      under = towers.map(() => [] as number[]);
    towers.forEach((t, i) => {
      for (const v of voxelsOf(t)) {
        if (v.level === 0 || (!t.lying && v.level !== t.level)) continue;
        const below = towers.findIndex((q) => !q.lying && q.at === v.cell && q.level + KIT[q.kind].units.length === v.level);
        if (below >= 0 && !over[below].includes(i)) {
          over[below].push(i);
          under[i].push(below);
        }
      }
    });
    const loose = towers.map((_, i) => i).filter((i) => passed.has(i) && towers[i].at !== start);
    for (let choice = 0; choice < 4; choice++) {
      const size = between(spec.tray, random),
        order = shuffled(loose, random),
        first = [order.find((i) => towers[i].lying), order.find((i) => towers[i].inverted), order.find((i) => spec.stacks && !towers[i].lying && towers[i].level > 0)].filter(
          (i): i is number => i !== undefined,
        ),
        chosen = new Set<number>();
      /** A tower with everything resting on it, all the way up (all must be loose to go into the tray). */
      const upward = (i: number, into = new Set<number>()): Set<number> | null => {
        if (into.has(i)) return into;
        if (!passed.has(i) || towers[i].at === start) return null;
        into.add(i);
        for (const j of over[i]) if (!upward(j, into)) return null;
        return into;
      };
      for (const i of [...first, ...order]) {
        const group = upward(i);
        if (!group) continue;
        if (chosen.size + [...group].filter((g) => !chosen.has(g)).length <= size) for (const g of group) chosen.add(g);
      }
      for (;;) {
        if (chosen.size < least) break;
        if (spec.lying === "always" && ![...chosen].some((i) => towers[i].lying)) break;
        if (spec.stacks && ![...chosen].some((i) => !towers[i].lying && towers[i].level > 0)) break;
        const trayIds = [...chosen].sort((a, b) => trayOrder(towers[a], towers[b]) || a - b),
          tray = trayIds.map((i) => towers[i]),
          given = towers.filter((_, i) => !chosen.has(i)),
          info = { cut: false },
          found = solutions({ start, goal, given }, tray, answers + 1, info);
        // A count that ran out of work proves nothing: another choice.
        if (info.cut) break;
        if (found.length >= 1 && found.length <= answers) {
          const answer = trayIds.map((i) => ({ at: towers[i].at, level: towers[i].level, yaw: towers[i].yaw }));
          return { start, goal, given, tray: tray.map((t) => ({ ...t, at: -1, level: -1, yaw: 0 })), answer, last: null, run: null, trouble: null, winner: null, ply: 0, stage: k };
        }
        if (!found.length) break;
        // Another way exists: fix a tower it sets elsewhere (and what it rests on, which must be fixed too).
        const keys = new Set(tray.map((t) => wayKey(t, t.at, t.level, t.yaw))),
          other = found.find((f) => f.some((a, j) => !keys.has(wayKey(tray[j], a.at, a.level, a.yaw)))) ?? found[1],
          moved = tray.findIndex((t, j) => !keys.has(wayKey(t, other[j].at, other[j].level, other[j].yaw))),
          fixedNow = trayIds[moved >= 0 ? moved : 0];
        const down = (i: number) => {
          chosen.delete(i);
          for (const j of under[i]) if (chosen.has(j)) down(j);
        };
        down(fixedNow);
      }
    }
  }
}
/** Tray towers in an order that tells nothing of the way: standing before lying, tall before short, by kit. */
const trayOrder = (a: Tower, b: Tower) => postureOf(a) - postureOf(b) || KIT[b.kind].units.length - KIT[a.kind].units.length || a.kind - b.kind;

/*
 * The hint.
 */
/** The layout with the tray towers already on the board fixed, and those still to set (by tray index). */
function split(state: State, without = -1) {
  const onBoard = state.tray.flatMap((t, j) => (t.at >= 0 && j !== without ? [j] : [])),
    rest = state.tray.flatMap((t, j) => (t.at < 0 || j === without ? [j] : []));
  return { layout: { start: state.start, goal: state.goal, given: [...state.given, ...onBoard.map((j) => state.tray[j])] }, rest };
}
/**
 * The next step toward an answer that keeps what is on the board: a tower still in the tray set where such an answer
 * has it (one that can be set down there now: supports first). When none keeps the board, a placed tower that an
 * answer keeping the rest sets elsewhere is carried there (or turned, or lifted back to the tray when it cannot go
 * straight there); failing that, the highest tower is lifted. Once everything is right, the marble is dropped. Null
 * when the puzzle is over.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const w = world(state);
  const { layout, rest } = split(state);
  if (!rest.length && !judge(state).trouble) return { from: -1, to: GO, extra: -1 };
  const found = rest.length
    ? solutions(
        layout,
        rest.map((j) => state.tray[j]),
        1,
      )
    : [];
  if (found.length) {
    const answer = found[0],
      order = rest.map((j, k) => ({ j, place: answer[k] })).sort((a, b) => a.place.level - b.place.level);
    for (const { j, place } of order) {
      const t = state.tray[j],
        lands = landing(w, t, place.at, place.yaw),
        move = { from: CELLS + j, to: put(place.at, place.yaw, postureOf(t)), extra: -1 };
      if (lands && lands.level === place.level && play(state, move)) return move;
    }
    const { j, place } = order[0];
    return { from: CELLS + j, to: put(place.at, place.yaw, postureOf(state.tray[j])), extra: -1 };
  }
  // A placed tower set wrongly: the highest first.
  const placed = state.tray
    .map((t, j) => ({ t, j }))
    .filter(({ t, j }) => t.at >= 0 && handle(state, w, j) >= 0)
    .sort((a, b) => b.t.level - a.t.level);
  for (const { t, j } of placed) {
    const { layout: others, rest: loose } = split(state, j),
      again = solutions(
        others,
        loose.map((k) => state.tray[k]),
        1,
      );
    if (!again.length) continue;
    const place = again[0][loose.indexOf(j)],
      from = handle(state, w, j);
    // An answer that keeps it where it is says nothing about it: the trouble is another's.
    if (wayKey(t, place.at, place.level, place.yaw) === wayKey(t, t.at, t.level, t.yaw)) continue;
    const lifted = world({ ...state, tray: state.tray.map((q, k) => (k === j ? { ...q, at: -1, level: -1 } : q)) }),
      lands = landing(lifted, t, place.at, place.yaw);
    if (lands && lands.level === place.level) {
      const move = { from, to: put(place.at, place.yaw, postureOf(t)), extra: -1 };
      if (play(state, move)) return move;
    }
    return { from, to: CELLS + j, extra: -1 };
  }
  const top = placed[0];
  if (top) return { from: handle(state, w, top.j), to: CELLS + top.j, extra: -1 };
  return { from: -1, to: GO, extra: -1 };
}
/** The answer as moves from a state (for tests): the hints followed to the drop. */
export function solve(state: State): Move[] {
  const out: Move[] = [];
  let s: State | null = state;
  for (let guard = 0; s && guard < 64; guard++) {
    const move = hint(s);
    if (!move) break;
    out.push(move);
    if (move.to === GO) break;
    s = play(s, move);
  }
  return out;
}
const effect = (): Effect | null => null;
export const marbleDrop: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => new Array<null>(CELLS + s.tray.length).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "쟁반의 탑을 판에 끌어다 놓고 눌러 돌린 뒤, 깔때기를 눌러 구슬을 넣으세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 구슬이 도착 컵에 들어갔습니다." : `실패! ${s.trouble?.words ?? ""}`),
};
