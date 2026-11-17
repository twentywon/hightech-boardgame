import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The marble drop maze, a puzzle of the kind ThinkFun sells as Gravity Maze (its rules of play are followed; its
 * look, cards and towers are not): pieces made of unit frames are set on a 4 × 4 grid, standing as columns or lying
 * as beams, so that a marble dropped into the start rolls by gravity alone through every piece into the target.
 *
 * The world is the 4 × 4 grid of cells (`row × 4 + column`, row 0 the far side, north) and its levels, 0 sitting on
 * the grid. A voxel is a cell at a level. Directions are 0 north, 1 east, 2 south (toward the player), 3 west.
 *
 * Units (one voxel each), each with a face turned by its piece's yaw:
 * - RAMP: a board sloping down to its face; the marble enters only from above (from the air or an OPEN unit over
 *   it, or dropped in at the start) and leaves level through its face into the next voxel;
 * - FLAT: a floor open on its face and the side opposite; the marble rolls through, level;
 * - CORNER: a floor open on its face and the side clockwise from it (its right); the marble turns through it;
 * - OPEN: a bare frame that only carries what is above it; to the marble it is air.
 *
 * Pieces are columns (1–5 units bottom to top, standing on a cell or on another column) and beams (2–3 units side
 * by side, lying at the level where two columns under them end). A piece's yaw turns its units clockwise seen from
 * above; a beam's units lie along `axisOf(yaw)` (east at yaw 0), its middle unit (`middle`) over its anchor cell.
 * A piece's place is its anchor cell, its level (a column's lowest unit, a beam's only one) and its yaw.
 *
 * Building rules (`survey`): pieces never overlap or leave the grid; nothing is on or over the start's cell or the
 * target's; a column stands on the grid or exactly on another column's top, never on a beam; a beam rests exactly
 * on at least two column tops (the rest of it may hang over air), never on a beam; a cell holds at most three
 * pieces. A column goes onto the top of its cell; a beam goes where its supports are. Only the top piece of a cell,
 * or a beam, can be lifted.
 *
 * The marble (`follow`): leaving a unit level into voxel v, it is lost off the grid (`off`); it rolls through a FLAT
 * or CORNER open toward it (a second one since the last ramp is `momentum`); a RAMP side or a closed side is a
 * `wall`; the target at level 0 ends the run; air or OPEN makes it fall. Falling through v, the voxel under v must
 * be a RAMP (it rolls on) or the target; a FLAT or CORNER there is `flat`, air or OPEN is `drop` (more than one
 * level), and the grid itself is `floor`. The run is won when it ends in the target with every tray piece placed
 * (else `left`) and every piece on the board passed (else `unused`).
 *
 * Moves (`Move`), where a cell is a point 0–15 and tray piece j is the point `CELLS + j`:
 * - `{from: CELLS + j, to: cell}`: tray piece j is put with its yaw onto `cell` (a beam with its middle over it);
 *   when it does not fit so, the next quarter turns are tried, so that a beam lies the way its supports run;
 * - `{from: cell, to: other}`: the top piece of `cell` is carried to `other` (`other` not one of its own cells),
 *   turned the same way;
 * - `{from: cell, to: cell}`: the top piece of `cell` is turned a quarter clockwise where it is (a beam about its
 *   middle, keeping its anchor); a turn that does not fit goes on to the next quarter that does;
 * - `{from: cell, to: CELLS + j}`: that piece, tray piece j, goes back to the tray (and its yaw to 0);
 * - `{from: CELLS + j or cell, to: PUT + other × 4 + yaw}`: put or carried to `other` turned to `yaw` (the hint's
 *   move; `other` may be its own anchor, to turn it there);
 * - `{from: -1, to: GO}` (or `to` the start's cell): the marble is dropped. A run that fails is not refused but
 *   made, with `winner` 1 and a `trouble` saying where and why, to be taken back with undo.
 * `extra` is always -1. A placement that breaks a building rule is refused (`play` gives null; `attempt` says why).
 */
export const SIZE = 4,
  CELLS = SIZE * SIZE,
  /** Levels of the world, 0 sitting on the grid. */
  LEVELS = 8,
  /** The most pieces a cell holds. */
  STACK = 3,
  /** The longest column and beam. */
  LONGEST = 5,
  BEAM_LONGEST = 3;
export const NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3;
export const OPEN = 0,
  RAMP = 1,
  FLAT = 2,
  CORNER = 3;
export type Kind = 0 | 1 | 2 | 3;
export interface Cube {
  kind: Kind;
  /** Its face before the piece's yaw. */
  face: number;
}
export type Shape = "column" | "beam";
export interface Piece {
  shape: Shape;
  /** A column's from the bottom up; a beam's along its axis. */
  units: Cube[];
  /** The anchor cell (a beam's middle unit), or -1 in the tray. */
  at: number;
  /** A column's lowest level, a beam's level; -1 in the tray. */
  level: number;
  yaw: number;
  /** The colour of its end caps, its own in the puzzle. */
  paint: number;
}
export interface Place {
  at: number;
  level: number;
  yaw: number;
}
/** Moves that are not points of the board. */
export const GO = 900,
  PUT = 1000;
export const put = (cell: number, yaw: number) => PUT + cell * 4 + (((yaw % 4) + 4) % 4);
export const slot = (j: number) => CELLS + j;
export const vox = (cell: number, level: number) => level * CELLS + cell;
const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
/** The cell `steps` away from `cell` toward `dir` (backward when negative), or -1 off the grid. */
export function neighbour(cell: number, dir: number, steps = 1) {
  if (cell < 0) return -1;
  const r = Math.floor(cell / SIZE) + DR[dir] * steps,
    c = (cell % SIZE) + DC[dir] * steps;
  return r < 0 || c < 0 || r >= SIZE || c >= SIZE ? -1 : r * SIZE + c;
}
export const back = (dir: number) => (dir + 2) % 4;
/** The way a beam's units run at a yaw: east at 0, south at 1, west at 2, north at 3. */
export const axisOf = (yaw: number) => (yaw + 1) % 4;
/** The index of a beam's middle unit (the first of the two of a beam of two). */
export const middle = (count: number) => (count - 1) >> 1;
/** A face as it acts: an open frame has none, a flat is the same turned half round. */
export const normalFace = (kind: Kind, face: number) => (kind === OPEN ? 0 : kind === FLAT ? face % 2 : face % 4);
/** The sides a flat or a corner opens to, in world directions. */
export const sides = (kind: Kind, face: number): number[] => (kind === FLAT ? [face % 4, (face + 2) % 4] : kind === CORNER ? [face % 4, (face + 1) % 4] : []);
export interface Voxel {
  cell: number;
  level: number;
  kind: Kind;
  /** Its face in the world. */
  face: number;
  /** Which unit of the piece it is. */
  unit: number;
}
/** The voxels a piece fills at a place, or null when some of it is off the grid. */
export function voxelsAt(piece: Pick<Piece, "shape" | "units">, at: number, level: number, yaw: number): Voxel[] | null {
  const out: Voxel[] = [],
    n = piece.units.length,
    axis = axisOf(yaw),
    mid = middle(n);
  for (let i = 0; i < n; i++) {
    const u = piece.units[i],
      cell = piece.shape === "column" ? at : neighbour(at, axis, i - mid),
      lv = piece.shape === "column" ? level + i : level;
    if (cell < 0) return null;
    out.push({ cell, level: lv, kind: u.kind, face: (u.face + yaw) % 4, unit: i });
  }
  return out;
}
export const voxelsOf = (piece: Piece) => (piece.at < 0 ? [] : (voxelsAt(piece, piece.at, piece.level, piece.yaw) ?? []));
/** What a piece makes of the world at a place, as text: two placements with the same key are the same. */
export function contentKey(piece: Pick<Piece, "shape" | "units">, at: number, level: number, yaw: number) {
  const voxels = voxelsAt(piece, at, level, yaw);
  if (!voxels) return "";
  return voxels
    .map((v) => vox(v.cell, v.level) * 16 + v.kind * 4 + normalFace(v.kind, v.face))
    .sort((a, b) => a - b)
    .join(",");
}
/** A piece's units as text, for telling identical pieces (pieces with the same units are the same piece). */
export const unitsKey = (piece: Pick<Piece, "shape" | "units">) => `${piece.shape[0]}${piece.units.map((u) => `${u.kind}${normalFace(u.kind, u.face)}`).join("")}`;
/** The yaw of a placement turned to the smallest that makes the same thing (a column of open frames looks alike every way). */
export function normalYaw(piece: Pick<Piece, "shape" | "units">, at: number, level: number, yaw: number) {
  const key = contentKey(piece, at, level, yaw);
  for (let y = 0; y < 4; y++) if (contentKey(piece, at, level, y) === key) return y;
  return yaw;
}

export interface State {
  /** The start: a fixed column whose top unit is a ramp. */
  start: Piece;
  /** The target's cell; its cup sits at level 0. */
  goal: number;
  /** Pieces fixed in place from the start. */
  given: Piece[];
  /** The pieces to place: in the tray (`at` -1) or on the board. */
  tray: Piece[];
  /** Where each tray piece belongs (identical pieces may be swapped). */
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
  /** The tray piece moved (-1 for the drop). */
  piece: number;
  from: Place | null;
  to: Place | null;
}
export type Fault = "off" | "momentum" | "wall" | "flat" | "drop" | "floor" | "left" | "unused" | "loop";
/** One voxel the marble passed: what it was, the way it came and the way it left (-1 falling, or at the goal). */
export interface Leg {
  cell: number;
  level: number;
  kind: "start" | "ramp" | "flat" | "corner" | "fall" | "goal";
  from: number;
  dir: number;
  /** The piece there by its board id (`ids`), or -1 for air. */
  piece: number;
}
export interface Run {
  legs: Leg[];
  fault: Fault | null;
  /** The voxel it went wrong at (null off the grid, or when it was not the way). */
  at: { cell: number; level: number } | null;
}
export interface Trouble {
  fault: Fault;
  at: { cell: number; level: number } | null;
  /** Tray pieces the trouble is about (left in the tray, or not passed), and given ones not passed. */
  tray: number[];
  given: number[];
  words: string;
}
/** Board ids: 0 the start, 1 + g the given pieces, 1 + given + j the tray's. */
export const ids = (state: Pick<State, "given">) => ({ start: 0, given: (g: number) => 1 + g, tray: (j: number) => 1 + state.given.length + j });
/** Every piece by its board id (null for a tray piece in the tray). */
export function pieces(state: Pick<State, "start" | "given" | "tray">): (Piece | null)[] {
  return [state.start, ...state.given, ...state.tray.map((p) => (p.at >= 0 ? p : null))];
}
export interface World {
  /** The board id filling each voxel, or -1. */
  owner: Int16Array;
  kind: Int8Array;
  face: Int8Array;
}
export type Refusal = "edge" | "high" | "overlap" | "reserved" | "crowded" | "floating" | "onBeam" | "beamOnBeam" | "beamSupport" | "under" | "fixed" | "same";
const REFUSALS: Record<Refusal, string> = {
  edge: "다리는 판 밖으로 나갈 수 없습니다.",
  high: "그렇게 높이는 쌓을 수 없습니다.",
  overlap: "다른 부품과 겹칩니다.",
  reserved: "출발점과 도착점 위에는 아무것도 놓을 수 없습니다.",
  crowded: "한 칸에는 세 개까지만 쌓을 수 있습니다.",
  floating: "기둥은 판 위나 다른 기둥 위에만 섭니다.",
  onBeam: "다리 위에는 아무것도 놓을 수 없습니다.",
  beamOnBeam: "다리는 다른 다리 위에 놓을 수 없습니다.",
  beamSupport: "다리는 높이가 같은 기둥 두 개 위에 걸쳐야 합니다.",
  under: "위에 다른 부품이 있어 들 수 없습니다.",
  fixed: "처음부터 놓인 부품은 움직일 수 없습니다.",
  same: "",
};
/** Why a placement was refused, in a sentence. */
export const refusalWords = (refusal: Refusal) => REFUSALS[refusal];
/**
 * Lays every piece into the world and checks the building rules; the refusal when one is broken. `goal` is the
 * target's cell and the start is the piece with id 0.
 */
export function survey(list: (Piece | null)[], goal: number): World | Refusal {
  const n = CELLS * LEVELS,
    owner = new Int16Array(n).fill(-1),
    kind = new Int8Array(n),
    face = new Int8Array(n),
    start = list[0]!.at;
  for (let id = 0; id < list.length; id++) {
    const p = list[id];
    if (!p) continue;
    const voxels = voxelsAt(p, p.at, p.level, p.yaw);
    if (!voxels) return "edge";
    for (const v of voxels) {
      if (v.level < 0 || v.level >= LEVELS) return "high";
      if (v.cell === goal || (id !== 0 && v.cell === start)) return "reserved";
      const i = vox(v.cell, v.level);
      if (owner[i] >= 0) return "overlap";
      owner[i] = id;
      kind[i] = v.kind;
      face[i] = v.face;
    }
  }
  const shapeOf = (id: number) => list[id]!.shape;
  for (let id = 0; id < list.length; id++) {
    const p = list[id];
    if (!p) continue;
    if (p.shape === "column") {
      if (p.level === 0) continue;
      const below = owner[vox(p.at, p.level - 1)];
      if (below < 0) return "floating";
      if (shapeOf(below) === "beam") return "onBeam";
    } else {
      if (p.level < 1) return "beamSupport";
      let held = 0;
      for (const v of voxelsAt(p, p.at, p.level, p.yaw)!) {
        const below = owner[vox(v.cell, v.level - 1)];
        if (below < 0) continue;
        if (shapeOf(below) === "beam") return "beamOnBeam";
        held++;
      }
      if (held < 2) return "beamSupport";
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
  return { owner, kind, face };
}
/** The world of a state (whose pieces always keep the rules). */
export function world(state: Pick<State, "start" | "given" | "tray" | "goal">): World {
  const made = survey(pieces(state), state.goal);
  if (typeof made === "string") throw new Error(`marble drop: a state breaks a rule (${made})`);
  return made;
}
/** The board id of the piece highest in a cell, or -1. */
export function topIn(w: World, cell: number) {
  for (let level = LEVELS - 1; level >= 0; level--) {
    const o = w.owner[vox(cell, level)];
    if (o >= 0) return o;
  }
  return -1;
}
/** The first free level of a cell: one over the highest thing in it. */
export function heightOf(w: World, cell: number) {
  for (let level = LEVELS - 1; level >= 0; level--) if (w.owner[vox(cell, level)] >= 0) return level + 1;
  return 0;
}
/**
 * Where a piece lands when it is set down at `cell` turned to `yaw` (the piece itself lifted first): a column on top
 * of the cell; a beam with its middle over the cell, at the level of the highest of the columns under it. Null when
 * a beam would leave the grid.
 */
export function landing(w: World, piece: Pick<Piece, "shape" | "units">, cell: number, yaw: number): Place | null {
  if (piece.shape === "column") return { at: cell, level: heightOf(w, cell), yaw };
  const voxels = voxelsAt(piece, cell, 0, yaw);
  if (!voxels) return null;
  let level = 0;
  for (const v of voxels) level = Math.max(level, heightOf(w, v.cell));
  return { at: cell, level, yaw };
}

/** How the marble goes through a world, from the start's ramp, as far as it gets. */
export function follow(state: Pick<State, "start" | "goal">, w: World): Run & { passed: Set<number> } {
  const { start, goal } = state,
    top = start.level + start.units.length - 1,
    startFace = (start.units[start.units.length - 1].face + start.yaw) % 4,
    legs: Leg[] = [{ cell: start.at, level: top, kind: "start", from: -1, dir: startFace, piece: 0 }],
    passed = new Set<number>([0]),
    end = (fault: Fault | null, at: Run["at"]) => ({ legs, fault, at, passed });
  let cell = neighbour(start.at, startFace),
    level = top,
    dir = startFace,
    flats = 0,
    falling = false;
  for (let guard = 0; guard < 4 * CELLS * LEVELS; guard++) {
    if (!falling) {
      if (cell < 0) return end("off", null);
      if (cell === goal && level === 0) {
        legs.push({ cell, level: 0, kind: "goal", from: dir, dir: -1, piece: -1 });
        return end(null, { cell, level: 0 });
      }
      const i = vox(cell, level),
        o = w.owner[i],
        k = w.kind[i] as Kind;
      if (o < 0 || k === OPEN) {
        legs.push({ cell, level, kind: "fall", from: dir, dir: -1, piece: o });
        if (o >= 0) passed.add(o);
        falling = true;
        continue;
      }
      if (k === RAMP) return end("wall", { cell, level });
      const ways = sides(k, w.face[i]),
        came = back(dir);
      if (!ways.includes(came)) return end("wall", { cell, level });
      if (flats >= 1) return end("momentum", { cell, level });
      const out = ways[0] === came ? ways[1] : ways[0];
      legs.push({ cell, level, kind: k === FLAT ? "flat" : "corner", from: dir, dir: out, piece: o });
      passed.add(o);
      flats++;
      cell = neighbour(cell, out);
      dir = out;
      continue;
    }
    if (level === 0) return end("floor", { cell, level: 0 });
    if (cell === goal && level === 1) {
      legs.push({ cell, level: 0, kind: "goal", from: -1, dir: -1, piece: -1 });
      return end(null, { cell, level: 0 });
    }
    const i = vox(cell, level - 1),
      o = w.owner[i],
      k = w.kind[i] as Kind;
    if (o < 0 || k === OPEN) return end("drop", { cell, level: level - 1 });
    if (k !== RAMP) return end("flat", { cell, level: level - 1 });
    const face = w.face[i];
    legs.push({ cell, level: level - 1, kind: "ramp", from: dir, dir: face, piece: o });
    passed.add(o);
    level--;
    dir = face;
    cell = neighbour(cell, face);
    flats = 0;
    falling = false;
  }
  return end("loop", null);
}
const WHY: Record<Fault, string> = {
  off: "구슬이 판 밖으로 굴러 나갔습니다.",
  momentum: "구슬이 경사를 내려온 뒤 수평으로 두 칸을 굴러 힘을 잃었습니다.",
  wall: "구슬이 막힌 벽에 부딪혔습니다.",
  flat: "구슬이 곧은 길이나 굽은 길 위로 떨어졌습니다.",
  drop: "구슬이 한 층보다 더 깊이 떨어졌습니다.",
  floor: "구슬이 판 위로 떨어졌습니다.",
  left: "구슬은 도착 컵에 들어갔지만 아직 놓지 않은 부품이 있습니다.",
  unused: "구슬은 도착 컵에 들어갔지만 구슬이 지나가지 않은 부품이 있습니다.",
  loop: "구슬이 같은 곳을 맴돌았습니다.",
};
/** Why a drop failed, in a sentence. */
export const why = (fault: Fault) => WHY[fault];
/** What a drop of the marble comes to: its way, and the trouble (null when it is a win). */
export function judge(state: State): { run: Run; trouble: Trouble | null } {
  const { passed, ...run } = follow(state, world(state));
  if (run.fault) return { run, trouble: { fault: run.fault, at: run.at, tray: [], given: [], words: why(run.fault) } };
  const left = state.tray.flatMap((p, j) => (p.at < 0 ? [j] : []));
  if (left.length) return { run, trouble: { fault: "left", at: run.at, tray: left, given: [], words: why("left") } };
  const id = ids(state),
    tray = state.tray.flatMap((_, j) => (passed.has(id.tray(j)) ? [] : [j])),
    given = state.given.flatMap((_, g) => (passed.has(id.given(g)) ? [] : [g]));
  if (tray.length || given.length) return { run, trouble: { fault: "unused", at: run.at, tray, given, words: why("unused") } };
  return { run, trouble: null };
}

/** A cell where tray piece j is the highest thing (a press there takes it up), or -1 while something lies over it. */
export function handle(state: Pick<State, "given" | "tray">, w: World, j: number) {
  const id = ids(state).tray(j);
  for (const v of voxelsOf(state.tray[j])) if (topIn(w, v.cell) === id) return v.cell;
  return -1;
}
/** The tray piece a point names to be lifted: a tray place, or the top piece of a cell. */
function lifted(state: State, w: World, from: number): { j: number; cell: number } | Refusal | null {
  if (from >= CELLS) {
    const j = from - CELLS;
    return j < state.tray.length && state.tray[j].at < 0 ? { j, cell: -1 } : null;
  }
  if (from < 0 || from >= CELLS) return null;
  const top = topIn(w, from);
  if (top < 0) return null;
  const first = 1 + state.given.length;
  if (top < first) return "fixed";
  return { j: top - first, cell: from };
}
/** The state a move would make, the refusal of a placement that breaks a rule, or null for a move that is not one. */
export function attempt(state: State, move: Move): State | Refusal | null {
  const { from, to } = move;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from === -1) {
    if (to !== GO && to !== state.start.at) return null;
    const { run, trouble } = judge(state);
    return { ...state, last: { kind: "go", piece: -1, from: null, to: null }, run, trouble, winner: trouble ? 1 : 0, ply: state.ply + 1 };
  }
  const w = world(state),
    taken = lifted(state, w, from);
  if (taken === null || typeof taken === "string") return taken;
  const { j } = taken,
    piece = state.tray[j],
    onBoard = piece.at >= 0,
    own = new Set(voxelsOf(piece).map((v) => v.cell)),
    was: Place | null = onBoard ? { at: piece.at, level: piece.level, yaw: piece.yaw } : null;
  // Only a beam, or the highest piece of its cell, comes off.
  if (onBoard && piece.shape === "column" && topIn(w, piece.at) !== ids(state).tray(j)) return "under";
  const tray = state.tray.map((p) => ({ ...p })),
    without = { ...state, tray: tray.map((p, k) => (k === j ? { ...p, at: -1, level: -1 } : p)) },
    bare = world(without);
  const done = (next: Piece, kind: Last["kind"]): State | Refusal => {
    tray[j] = next;
    const made = survey(pieces({ ...state, tray }), state.goal);
    if (typeof made === "string") return made;
    return { ...state, tray, last: { kind, piece: j, from: was, to: next.at >= 0 ? { at: next.at, level: next.level, yaw: next.yaw } : null }, run: null, trouble: null, ply: state.ply + 1 };
  };
  /**
   * Sets the piece down at `cell` turned to `yaw`; with `tries` above 1 the next quarter turns are tried in order
   * when that one does not fit (a beam lies the way its supports run), and the first refusal is told if none does.
   */
  const setAt = (cell: number, yaw: number, kind: Last["kind"], tries = 1): State | Refusal | null => {
    if (cell < 0 || cell >= CELLS) return null;
    let first: Refusal | null = null;
    for (let k = 0; k < tries; k++) {
      const place = landing(bare, piece, cell, (yaw + k) % 4);
      if (!place) {
        first ??= "edge";
        continue;
      }
      if (was && contentKey(piece, was.at, was.level, was.yaw) === contentKey(piece, place.at, place.level, place.yaw)) {
        first ??= "same";
        continue;
      }
      const made = done({ ...piece, ...place }, kind);
      if (typeof made !== "string") return made;
      first ??= made;
    }
    return first;
  };
  if (to >= PUT) {
    const cell = Math.floor((to - PUT) / 4),
      yaw = (to - PUT) % 4;
    return setAt(cell, yaw, !onBoard ? "put" : cell === piece.at ? "turn" : "carry");
  }
  if (to === CELLS + j) return onBoard ? done({ ...piece, at: -1, level: -1, yaw: 0 }, "back") : null;
  if (to < 0 || to >= CELLS) return null;
  if (!onBoard) return setAt(to, piece.yaw, "put", 4);
  // A tap on a piece's own cell turns it about its anchor (on to the next quarter that fits); a carry goes to a
  // cell it is not on, turned as it is if it fits there.
  if (to === from) return setAt(piece.at, (piece.yaw + 1) % 4, "turn", 3);
  if (own.has(to)) return null;
  return setAt(to, piece.yaw, "carry", 4);
}
/** A move of a piece or the drop of the marble; null (and the state left alone) when it may not be made. */
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
  const out: Move[] = [{ from: -1, to: GO, extra: -1 }, { from: -1, to: state.start.at, extra: -1 }],
    w = world(state),
    id = ids(state),
    ok = (move: Move) => {
      if (play(state, move)) out.push(move);
    };
  state.tray.forEach((p, j) => {
    if (p.at < 0) {
      for (let cell = 0; cell < CELLS; cell++) ok({ from: CELLS + j, to: cell, extra: -1 });
      return;
    }
    // From every cell where it is the highest thing, each cell once (a column's units all stand in one).
    for (const from of new Set(voxelsOf(p).map((v) => v.cell))) {
      if (topIn(w, from) !== id.tray(j)) continue;
      for (let cell = 0; cell < CELLS; cell++) ok({ from, to: cell, extra: -1 });
      ok({ from, to: CELLS + j, extra: -1 });
    }
  });
  return out;
}

/*
 * The solver: every way to set the tray's pieces so that the marble wins, found by following the marble and
 * deciding what fills each voxel it comes to only when it comes there.
 */
export interface Layout {
  start: Piece;
  goal: number;
  given: Piece[];
}
const RESERVED = -2;
/**
 * The ways of placing `tray` (pieces with their units; places ignored) on a layout so that the marble dropped at
 * the start passes every piece into the target, up to `cap` of them, each as a place per tray piece. Identical
 * pieces swapped are one way. The marble is followed from the start; at a voxel nothing has decided yet it is
 * tried as air and as each unit of each piece left that could take the marble there (the piece is then set so that
 * that unit fills the voxel), the voxels it passed as air being kept clear. Supports and stacks are checked at the
 * end, by the building rules themselves, so a support may well be passed after the piece it carries.
 */
export function solutions(layout: Layout, tray: Pick<Piece, "shape" | "units">[], cap = 2): Place[][] {
  const fixed: Piece[] = [layout.start, ...layout.given],
    n = CELLS * LEVELS,
    owner = new Int16Array(n).fill(-1),
    kind = new Int8Array(n),
    face = new Int8Array(n),
    goal = layout.goal,
    startCell = layout.start.at;
  for (let id = 0; id < fixed.length; id++)
    for (const v of voxelsOf(fixed[id])) {
      const i = vox(v.cell, v.level);
      owner[i] = id;
      kind[i] = v.kind;
      face[i] = v.face;
    }
  // Identical pieces form one group: a group's pieces are placed in turn, so that swapping them counts once.
  const groups: { piece: Pick<Piece, "shape" | "units">; members: number[]; places: Place[] }[] = [];
  tray.forEach((p, j) => {
    const key = unitsKey(p),
      group = groups.find((g) => unitsKey(g.piece) === key);
    if (group) group.members.push(j);
    else groups.push({ piece: p, members: [j], places: [] });
  });
  const firstTray = fixed.length,
    groupOf: number[] = [],
    passedFixed = new Uint8Array(fixed.length),
    found: Place[][] = [];
  let unplaced = tray.length,
    nextId = firstTray;
  passedFixed[0] = 1;
  const placedPieces: Piece[] = [];
  /** Sets a group's next piece at a place, if its voxels are free and nothing already decided rules it out. */
  const place = (g: number, at: number, level: number, yaw: number): boolean => {
    const group = groups[g],
      voxels = voxelsAt(group.piece, at, level, yaw);
    if (!voxels) return false;
    for (const v of voxels) {
      if (v.level < 0 || v.level >= LEVELS || v.cell === goal || v.cell === startCell) return false;
      if (owner[vox(v.cell, v.level)] !== -1) return false;
    }
    if (group.piece.shape === "column") {
      // On the grid or on a column (not a beam, not a voxel kept clear).
      if (level > 0) {
        const below = owner[vox(at, level - 1)];
        if (below === RESERVED) return false;
        if (below >= 0 && shapeAt(below) === "beam") return false;
      }
    } else {
      if (level < 1) return false;
      for (const v of voxels) {
        const below = owner[vox(v.cell, level - 1)];
        if (below >= 0 && shapeAt(below) === "beam") return false;
        if (level + 1 < LEVELS) {
          const over = owner[vox(v.cell, level + 1)];
          if (over >= 0 && shapeAt(over) === "column" && baseOf(over) === level + 1) return false;
          if (over >= 0 && shapeAt(over) === "beam") return false;
        }
      }
    }
    const id = nextId++;
    for (const v of voxels) {
      const i = vox(v.cell, v.level);
      owner[i] = id;
      kind[i] = v.kind;
      face[i] = v.face;
    }
    groupOf[id - firstTray] = g;
    placedPieces[id - firstTray] = { ...group.piece, at, level, yaw, paint: 0 } as Piece;
    group.places.push({ at, level, yaw });
    unplaced--;
    return true;
  };
  const unplace = (g: number) => {
    const id = --nextId,
      p = placedPieces[id - firstTray];
    for (const v of voxelsOf(p)) owner[vox(v.cell, v.level)] = -1;
    groups[g].places.pop();
    unplaced++;
  };
  const shapeAt = (id: number): Shape => (id < firstTray ? fixed[id].shape : placedPieces[id - firstTray].shape);
  const baseOf = (id: number) => (id < firstTray ? fixed[id].level : placedPieces[id - firstTray].level);
  const passed = (id: number) => {
    if (id < firstTray) passedFixed[id]++;
  };
  const unpass = (id: number) => {
    if (id < firstTray) passedFixed[id]--;
  };
  const finish = () => {
    if (unplaced) return;
    for (let id = 0; id < fixed.length; id++) if (!passedFixed[id]) return;
    // Every building rule over the whole board, now that every piece has a place.
    const list: (Piece | null)[] = [...fixed, ...placedPieces.slice(0, nextId - firstTray)];
    if (typeof survey(list, goal) === "string") return;
    const answer: Place[] = new Array(tray.length);
    for (const group of groups) group.members.forEach((j, k) => (answer[j] = group.places[k]));
    found.push(answer);
  };
  /** What units of what groups could fill a voxel: each tried in turn (deduplicated by what it makes). */
  const tryUnits = (cell: number, level: number, wanted: (k: Kind, f: number) => boolean, then: () => void) => {
    for (let g = 0; g < groups.length && found.length < cap; g++) {
      const group = groups[g];
      if (group.places.length >= group.members.length) continue;
      const seen = new Set<string>(),
        units = group.piece.units;
      for (let u = 0; u < units.length && found.length < cap; u++)
        for (let yaw = 0; yaw < 4 && found.length < cap; yaw++) {
          const f = (units[u].face + yaw) % 4;
          if (!wanted(units[u].kind, f)) continue;
          let at: number, level0: number;
          if (group.piece.shape === "column") {
            at = cell;
            level0 = level - u;
            if (level0 < 0) continue;
          } else {
            at = neighbour(cell, axisOf(yaw), middle(units.length) - u);
            level0 = level;
            if (at < 0) continue;
          }
          const key = contentKey(group.piece, at, level0, yaw);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (!place(g, at, level0, yaw)) continue;
          then();
          unplace(g);
        }
    }
  };
  /** The marble rolls level into (cell, level) going `dir`, `flats` flats or corners since the last ramp. */
  const enter = (cell: number, level: number, dir: number, flats: number, depth: number): void => {
    if (found.length >= cap || depth > 200 || cell < 0) return;
    if (cell === goal && level === 0) return finish();
    const i = vox(cell, level),
      o = owner[i];
    if (o >= 0) {
      const k = kind[i] as Kind;
      if (k === OPEN) {
        passed(o);
        fall(cell, level, depth + 1);
        unpass(o);
        return;
      }
      if (k === RAMP || flats >= 1) return;
      const ways = sides(k, face[i]),
        came = back(dir);
      if (!ways.includes(came)) return;
      const out = ways[0] === came ? ways[1] : ways[0];
      passed(o);
      enter(neighbour(cell, out), level, out, flats + 1, depth + 1);
      unpass(o);
      return;
    }
    if (o === RESERVED) return fall(cell, level, depth + 1);
    // Nothing decided here yet: air, or a unit that lets the marble on (an open frame, or a flat or corner open toward it).
    if (level >= 1) {
      // Air over a column that would then float is no way.
      const over = level + 1 < LEVELS ? owner[vox(cell, level + 1)] : -1;
      if (!(over >= 0 && shapeAt(over) === "column" && baseOf(over) === level + 1)) {
        owner[i] = RESERVED;
        fall(cell, level, depth + 1);
        owner[i] = -1;
      }
    }
    const came = back(dir);
    tryUnits(
      cell,
      level,
      (k, f) => k === OPEN || (flats === 0 && (k === FLAT || k === CORNER) && sides(k, f).includes(came)),
      () => enter(cell, level, dir, flats, depth + 1),
    );
  };
  /** The marble falls from (cell, level) toward the voxel under it. */
  const fall = (cell: number, level: number, depth: number): void => {
    if (found.length >= cap || level === 0) return;
    if (cell === goal && level === 1) return finish();
    const i = vox(cell, level - 1),
      o = owner[i];
    if (o >= 0) {
      if (kind[i] !== RAMP) return;
      const f = face[i];
      passed(o);
      enter(neighbour(cell, f), level - 1, f, 0, depth + 1);
      unpass(o);
      return;
    }
    if (o === RESERVED) return;
    tryUnits(cell, level - 1, (k) => k === RAMP, () => fall(cell, level, depth + 1));
  };
  const s = layout.start,
    top = s.level + s.units.length - 1,
    f = (s.units[s.units.length - 1].face + s.yaw) % 4;
  enter(neighbour(s.at, f), top, f, 0, 0);
  return found;
}

/*
 * Laying a puzzle.
 */
export interface Stage {
  /** The start's top level (its ramp), from and to. */
  top: [number, number];
  /** Pieces in all, the start and the target counted, from and to. */
  pieces: [number, number];
  /** Pieces in the tray, from and to. */
  tray: [number, number];
  stacks: boolean;
  beams: boolean;
}
/** The four stages: more pieces, more of them to place, stacks from the second, beams from the third. */
export const STAGES: Stage[] = [
  { top: [2, 3], pieces: [4, 5], tray: [2, 2], stacks: false, beams: false },
  { top: [3, 3], pieces: [5, 6], tray: [3, 3], stacks: true, beams: false },
  { top: [3, 4], pieces: [6, 7], tray: [3, 4], stacks: true, beams: true },
  { top: [4, 4], pieces: [7, 9], tray: [4, 5], stacks: true, beams: true },
];
/** The stage a variant names (1 to 4). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
const pick = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const between = ([lo, hi]: [number, number], random: Random) => lo + Math.min(hi - lo, Math.floor(random() * (hi - lo + 1)));
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** What the marble's way decides of a voxel: a unit it rolls through, or air it falls through (`AIR`). */
const AIR = -1;
interface Trail {
  start: number;
  face: number;
  top: number;
  goal: number;
  /** By voxel: the unit kind (or AIR) and its world face. */
  path: Map<number, { kind: Kind | typeof AIR; face: number }>;
}
/**
 * The marble's way, built forward from the start: after each ramp it rolls level into the next voxel, which is
 * chosen to be a flat or a corner (at most one), air over a ramp one level down (facing anywhere it can go on), or,
 * at the bottom, the target. Null at a dead end.
 */
function trail(stage: Stage, random: Random): Trail | null {
  const top = between(stage.top, random),
    start = Math.floor(random() * CELLS),
    face = pick(
      [0, 1, 2, 3].filter((d) => neighbour(start, d) >= 0),
      random,
    ),
    path: Trail["path"] = new Map(),
    used = new Set<number>([start]);
  let cell = neighbour(start, face),
    level = top,
    dir = face,
    flats = 0;
  const onward = (c: number, d: number) => {
    const next = neighbour(c, d);
    return next >= 0 && next !== start;
  };
  for (let guard = 0; guard < 40; guard++) {
    if (cell < 0 || cell === start) return null;
    const free = !path.has(vox(cell, level)),
      options: { weight: number; go: () => boolean }[] = [];
    // The target: on a cell nothing else uses, at level 0, or one under the marble falling in.
    if (!used.has(cell) && level <= 1) {
      const here = cell,
        at = level;
      options.push({
        weight: 3,
        go: () => {
          if (at === 1) path.set(vox(here, 1), { kind: AIR, face: 0 });
          return true;
        },
      });
    }
    if (free && flats === 0)
      for (const out of [dir, (dir + 1) % 4, (dir + 3) % 4]) {
        if (!onward(cell, out)) continue;
        const here = cell,
          came = back(dir);
        options.push({
          weight: out === dir ? 0.7 : 0.5,
          go: () => {
            // A corner opens to its face and to the right of it.
            const corner = out !== dir,
              f = !corner ? dir % 2 : (came + 1) % 4 === out ? came : out;
            path.set(vox(here, level), { kind: corner ? CORNER : FLAT, face: f });
            used.add(here);
            cell = neighbour(here, out);
            dir = out;
            flats = 1;
            return false;
          },
        });
      }
    if (free && level >= 1 && !path.has(vox(cell, level - 1)))
      for (let e = 0; e < 4; e++) {
        if (!onward(cell, e)) continue;
        const here = cell;
        // Back toward where it came from is a fine turn of the stair (it makes towers stand side by side, and stacks),
        // but fresh cells are liked better, so that the way spreads over the grid.
        options.push({
          weight: e === back(dir) ? (stage.stacks ? 0.5 : 0.2) : used.has(neighbour(here, e)) ? 0.5 : 1,
          go: () => {
            path.set(vox(here, level), { kind: AIR, face: 0 });
            path.set(vox(here, level - 1), { kind: RAMP, face: e });
            used.add(here);
            level--;
            cell = neighbour(here, e);
            dir = e;
            flats = 0;
            return false;
          },
        });
      }
    if (!options.length) return null;
    let roll = random() * options.reduce((sum, o) => sum + o.weight, 0),
      chosen = options[options.length - 1];
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        chosen = option;
        break;
      }
    }
    const goalCell = cell;
    if (chosen.go()) return { start, face, top, goal: goalCell, path };
  }
  return null;
}
/** A piece being made: its units by world face, where they lie, and whether the marble passes each. */
interface Draft {
  shape: Shape;
  cells: number[];
  level: number;
  /** A beam's axis (east or south); a column's units go up. */
  axis: number;
  units: { kind: Kind; face: number; visited: boolean }[];
}
/** A unit to fill a voxel the marble does not pass: mostly an open frame, now and then something else. */
function padding(random: Random): { kind: Kind; face: number } {
  const roll = random();
  if (roll < 0.8) return { kind: OPEN, face: 0 };
  return { kind: roll < 0.88 ? FLAT : roll < 0.94 ? CORNER : RAMP, face: Math.floor(random() * 4) };
}
/**
 * The pieces of a way: beams where the stage has them and a row of voxels at one level can lie on two columns that
 * the marble passes too, and columns up from the grid to the highest unit of every other cell (open frames where it
 * falls through, padding where it does not pass), cut into pieces that each hold something the marble passes.
 */
function assemble(t: Trail, stage: Stage, random: Random): Draft[] | null {
  const at = (cell: number, level: number) => t.path.get(vox(cell, level)),
    unitAt = (cell: number, level: number) => {
      const p = at(cell, level);
      return p !== undefined && p.kind !== AIR;
    },
    highestUnit = (cell: number, below = LEVELS) => {
      for (let level = below - 1; level >= 0; level--) if (unitAt(cell, level)) return level;
      return -1;
    },
    visitedBelow = (cell: number, level: number) => {
      for (let l = 0; l < level; l++) if (at(cell, l) !== undefined) return true;
      return false;
    },
    beams: { cells: number[]; level: number; axis: number; supports: Set<number> }[] = [],
    inBeam = new Map<number, { level: number; supports: Set<number> }>();
  const banned = (cell: number) => cell === t.start || cell === t.goal;
  if (stage.beams) {
    const candidates: { cells: number[]; level: number; axis: number; supports: Set<number>; weight: number }[] = [];
    for (let level = 1; level <= t.top; level++)
      for (const axis of [EAST, SOUTH])
        for (let first = 0; first < CELLS; first++)
          for (const length of [2, 3]) {
            const cells: number[] = [];
            for (let k = 0; k < length; k++) cells.push(neighbour(first, axis, k));
            if (cells.some((c) => c < 0 || banned(c))) continue;
            // Nothing the marble needs stands on the beam.
            if (cells.some((c) => highestUnit(c) > level)) continue;
            const visited = cells.filter((c) => at(c, level) !== undefined).length;
            if (!visited) continue;
            const must = cells.filter((c) => unitAt(c, level - 1)),
              may = cells.filter((c) => !must.includes(c) && visitedBelow(c, level));
            if (must.some((c) => !visitedBelow(c, level))) continue;
            if (must.length + may.length < 2) continue;
            const supports = new Set(must);
            for (const c of shuffled(may, random)) if (supports.size < 2 || random() < 0.5) supports.add(c);
            if (supports.size < 2) continue;
            candidates.push({ cells, level, axis, supports, weight: visited + (length === 3 ? 0.5 : 0) + (supports.size < length ? 1 : 0) });
          }
    const wanted = stage.pieces[1] >= 8 && random() < 0.4 ? 2 : 1;
    for (const c of shuffled(candidates, random)) {
      if (beams.length >= wanted) break;
      if (c.cells.some((cell) => inBeam.has(cell))) continue;
      beams.push(c);
      for (const cell of c.cells) inBeam.set(cell, { level: c.level, supports: c.supports });
    }
    if (!beams.length) return null;
  }
  const drafts: Draft[] = [];
  for (const b of beams)
    drafts.push({
      shape: "beam",
      cells: b.cells,
      level: b.level,
      axis: b.axis,
      units: b.cells.map((cell) => {
        const p = at(cell, b.level);
        if (p === undefined) return { ...padding(random), visited: false };
        return p.kind === AIR ? { kind: OPEN, face: 0, visited: true } : { kind: p.kind, face: p.face, visited: true };
      }),
    });
  for (let cell = 0; cell < CELLS; cell++) {
    if (banned(cell)) continue;
    const beam = inBeam.get(cell);
    let height: number;
    if (beam && beam.supports.has(cell)) height = beam.level;
    else if (beam) height = highestUnit(cell, beam.level - 1) + 1;
    else {
      height = highestUnit(cell) + 1;
      // An open frame on top where the marble falls in over the highest ramp, now and then.
      if (height > 0 && at(cell, height)?.kind === AIR && random() < 0.4) height++;
    }
    if (height <= 0) continue;
    const column = Array.from({ length: height }, (_, level) => {
      const p = at(cell, level);
      if (p === undefined) return { ...padding(random), visited: false };
      return p.kind === AIR ? { kind: OPEN as Kind, face: 0, visited: true } : { kind: p.kind, face: p.face, visited: true };
    });
    const room = STACK - (beam ? 1 : 0),
      cuts = split(column, stage.stacks ? room : 1, random);
    if (!cuts) return null;
    for (const [lo, hi] of cuts) drafts.push({ shape: "column", cells: [cell], level: lo, axis: 0, units: column.slice(lo, hi) });
  }
  return drafts;
}
/** Cuts a cell's column into at most `count` pieces of at most five units, each holding a unit the marble passes. */
function split(column: { visited: boolean }[], count: number, random: Random): [number, number][] | null {
  const visited = column.flatMap((u, level) => (u.visited ? [level] : []));
  if (!visited.length) return null;
  for (let tries = 0; tries < 12; tries++) {
    const most = Math.min(count, visited.length),
      pieces = most <= 1 ? 1 : random() < 0.65 ? most : 1 + Math.floor(random() * most),
      // A cut between two passed units, somewhere above the lower one.
      gaps = shuffled(
        visited.slice(1).map((v, k) => [visited[k] + 1, v] as [number, number]),
        random,
      ).slice(0, pieces - 1),
      cuts = gaps.map(([lo, hi]) => lo + Math.floor(random() * (hi - lo + 1))).sort((a, b) => a - b),
      edges = [0, ...cuts, column.length],
      out: [number, number][] = [];
    for (let k = 0; k + 1 < edges.length; k++) out.push([edges[k], edges[k + 1]]);
    if (out.every(([lo, hi]) => hi - lo >= 1 && hi - lo <= LONGEST)) return out;
  }
  return null;
}
/**
 * A piece's units written the one way identical pieces share (a column turned so, a beam read from one end), and its
 * place in that writing; so that identical pieces have the same units and any of them fits any of their places.
 */
function canonical(piece: Piece): Piece {
  const variants: Pick<Piece, "shape" | "units">[] = [];
  const norm = (units: Cube[]) => units.map((u) => ({ kind: u.kind, face: normalFace(u.kind, u.face) }));
  if (piece.shape === "column") for (let r = 0; r < 4; r++) variants.push({ shape: "column", units: norm(piece.units.map((u) => ({ kind: u.kind, face: (u.face + r) % 4 }))) });
  else
    variants.push(
      { shape: "beam", units: norm(piece.units) },
      {
        shape: "beam",
        units: norm([...piece.units].reverse().map((u) => ({ kind: u.kind, face: (u.face + 2) % 4 }))),
      },
    );
  variants.sort((a, b) => (unitsKey(a) < unitsKey(b) ? -1 : unitsKey(a) > unitsKey(b) ? 1 : 0));
  const best = variants[0],
    want = contentKey(piece, piece.at, piece.level, piece.yaw);
  for (let yaw = 0; yaw < 4; yaw++)
    for (let at = 0; at < CELLS; at++)
      if (contentKey(best, at, piece.level, yaw) === want) return { ...piece, units: best.units, at, yaw: normalYaw(best, at, piece.level, yaw) };
  return piece;
}
/** The colours of the pieces' end caps (none is red, which is kept for trouble). */
export const PAINTS = ["#f2c230", "#3b86d8", "#4caf5a", "#8a5ccc", "#18a5a5", "#ee8a2a", "#e05fa0", "#7fb800", "#5b6bd8", "#9a6a48"];
/** Turns drafts into pieces at their answer places, each turned at random and then written canonically. */
function realise(drafts: Draft[], random: Random): Piece[] {
  const paints = shuffled(
    PAINTS.map((_, k) => k),
    random,
  );
  return drafts.map((d, k) => {
    let yaw: number, units: Cube[], at: number;
    if (d.shape === "column") {
      yaw = Math.floor(random() * 4);
      at = d.cells[0];
      units = d.units.map((u) => ({ kind: u.kind, face: (u.face - yaw + 8) % 4 }));
    } else {
      // A beam along the east runs so at yaw 0, read from its other end at yaw 2 (and south at 1 or 3).
      const flip = random() < 0.5;
      yaw = (d.axis === EAST ? 0 : 1) + (flip ? 2 : 0);
      const ordered = flip ? [...d.units].reverse() : d.units,
        cells = flip ? [...d.cells].reverse() : d.cells;
      at = cells[middle(cells.length)];
      units = ordered.map((u) => ({ kind: u.kind, face: (u.face - yaw + 8) % 4 }));
    }
    return canonical({ shape: d.shape, units, at, level: d.level, yaw, paint: paints[k % paints.length] });
  });
}
/** Tray pieces in a fixed order that tells nothing of the way: columns by height, then beams by length. */
const trayOrder = (a: Piece, b: Piece) => (a.shape === b.shape ? a.units.length - b.units.length || (unitsKey(a) < unitsKey(b) ? -1 : 1) : a.shape === "column" ? -1 : 1);
/**
 * A puzzle of a stage with exactly one answer: a way is laid and made into pieces; the stage's count of them go
 * into the tray (a beam and a stacked column among them where the stage has those) and the rest stay fixed; while
 * the solver finds more than one way to set the tray, the piece the other way sets differently is fixed too, and
 * when the tray grows too small another choice is tried, then another way laid.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const k = stageOf(stage),
    spec = STAGES[k - 1];
  for (let tries = 0; ; tries++) {
    const t = trail(spec, random);
    if (!t) continue;
    const drafts = assemble(t, spec, random);
    if (!drafts) continue;
    const count = drafts.length + 2;
    if (count < spec.pieces[0] || count > spec.pieces[1]) continue;
    // A stage with stacks has a column standing on another.
    if (spec.stacks && !drafts.some((d) => d.shape === "column" && d.level > 0)) continue;
    const all = realise(drafts, random),
      top = t.top,
      start: Piece = canonicalStart(t.start, t.face, top),
      size = Math.min(all.length, spec.tray[1]);
    if (size < spec.tray[0]) continue;
    // What rests on what: a fixed piece may never stand on one of the tray's.
    const over = all.map(() => [] as number[]);
    all.forEach((p, i) => {
      for (const v of voxelsOf(p)) {
        if (v.level === 0 || (p.shape === "column" && v.level !== p.level)) continue;
        const below = all.findIndex((q) => q.shape === "column" && q.at === v.cell && q.level + q.units.length === v.level);
        if (below >= 0 && !over[below].includes(i)) over[below].push(i);
      }
    });
    /** A piece with everything resting on it, all the way up. */
    const upward = (i: number, into = new Set<number>()) => {
      if (!into.has(i)) {
        into.add(i);
        for (const j of over[i]) upward(j, into);
      }
      return into;
    };
    for (let choice = 0; choice < 3; choice++) {
      // A beam and a stacked column in the tray where there are any, the rest at random, each with what rests on it.
      const order = shuffled(
          all.map((_, i) => i),
          random,
        ),
        first = [order.find((i) => spec.beams && all[i].shape === "beam"), order.find((i) => spec.stacks && all[i].shape === "column" && all[i].level > 0)].filter((i): i is number => i !== undefined),
        chosen = new Set<number>();
      for (const i of [...first, ...order]) {
        const group = upward(i);
        if (chosen.size + [...group].filter((g) => !chosen.has(g)).length <= size) for (const g of group) chosen.add(g);
      }
      for (;;) {
        if (chosen.size < spec.tray[0]) break;
        const loose = [...chosen].map((i) => all[i]).sort(trayOrder),
          given = all.filter((_, i) => !chosen.has(i)),
          layout = { start, goal: t.goal, given },
          found = solutions(layout, loose, 2);
        if (found.length === 1) {
          const answer = found[0];
          return {
            start,
            goal: t.goal,
            given,
            tray: loose.map((p) => ({ ...p, at: -1, level: -1, yaw: 0 })),
            answer: answer.map((a, j) => ({ ...a, yaw: normalYaw(loose[j], a.at, a.level, a.yaw) })),
            last: null,
            run: null,
            trouble: null,
            winner: null,
            ply: 0,
            stage: k,
          };
        }
        if (!found.length) break;
        // Another way exists: fix a piece it sets elsewhere (and what it rests on, which must be fixed too).
        const keys = new Set(loose.map((p) => contentKey(p, p.at, p.level, p.yaw))),
          other = found.find((f) => f.some((a, j) => !keys.has(contentKey(loose[j], a.at, a.level, a.yaw)))) ?? found[1],
          moved = loose.findIndex((p, j) => !keys.has(contentKey(p, other[j].at, other[j].level, other[j].yaw))),
          fixedNow = all.indexOf(moved >= 0 ? loose[moved] : loose[0]);
        const down = (i: number) => {
          chosen.delete(i);
          all.forEach((_, j) => {
            if (chosen.has(j) && over[j].includes(i)) down(j);
          });
        };
        down(fixedNow);
      }
    }
  }
}
/** The start: open frames up to its ramp, which faces where the marble leaves. */
function canonicalStart(cell: number, face: number, top: number): Piece {
  return {
    shape: "column",
    units: [...Array.from({ length: top }, () => ({ kind: OPEN as Kind, face: 0 })), { kind: RAMP, face }],
    at: cell,
    level: 0,
    yaw: 0,
    paint: -1,
  };
}

/*
 * The hint.
 */
/** The tray pieces that stand where the answer has a piece like them (each answer place used once), by place. */
export function matched(state: State): { slotOf: number[]; filled: number[] } {
  const n = state.tray.length,
    slotOf = new Array<number>(n).fill(-1),
    filled = new Array<number>(n).fill(-1),
    want = state.answer.map((a, i) => contentKey(state.tray[i], a.at, a.level, a.yaw));
  state.tray.forEach((p, j) => {
    if (p.at < 0) return;
    const key = contentKey(p, p.at, p.level, p.yaw);
    for (let i = 0; i < n; i++)
      if (filled[i] < 0 && want[i] === key && unitsKey(state.tray[i]) === unitsKey(p)) {
        filled[i] = j;
        slotOf[j] = i;
        return;
      }
  });
  return { slotOf, filled };
}
/**
 * The next step toward the answer: answer places are taken from the bottom up (supports first); the first not yet
 * filled gets a piece like it (from the tray, or one set wrongly), unless something stands in its cells that should
 * not (then the highest piece there is lifted back to the tray first). A piece of its kind standing on its own place
 * turned wrongly is turned there. Once every place is filled, the marble is dropped. Null when the puzzle is over.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const w = world(state),
    id = ids(state),
    { slotOf, filled } = matched(state),
    first = id.tray(0),
    order = state.answer.map((_, i) => i).sort((a, b) => state.answer[a].level - state.answer[b].level || (state.tray[a].shape === "column" ? 0 : 1) - (state.tray[b].shape === "column" ? 0 : 1) || a - b),
    /** Lifting the highest piece in a cell back to the tray. */
    lift = (cell: number): Move => {
      const top = topIn(w, cell);
      return { from: cell, to: CELLS + (top - first), extra: -1 };
    },
    /** Null when a placed piece can come up; else the lift of what lies over it. */
    takeUp = (j: number): Move | null => (handle(state, w, j) >= 0 ? null : lift(voxelsOf(state.tray[j])[0].cell));
  for (const i of order) {
    if (filled[i] >= 0) continue;
    const want = state.answer[i],
      kind = unitsKey(state.tray[i]),
      cells = new Set(voxelsAt(state.tray[i], want.at, want.level, want.yaw)!.map((v) => v.cell));
    // What stands in the place's cells and should not: pieces set wrongly, or anything at its level or above.
    const blockers = new Set<number>();
    for (const cell of cells)
      for (let level = 0; level < LEVELS; level++) {
        const o = w.owner[vox(cell, level)];
        if (o < first) continue;
        const j = o - first;
        if (slotOf[j] < 0 || level >= want.level) blockers.add(j);
      }
    // One piece like it in the way, which can come up: set it right from where it is.
    if (blockers.size === 1) {
      const [j] = blockers,
        p = state.tray[j];
      const from = handle(state, w, j),
        move = { from, to: put(want.at, want.yaw), extra: -1 };
      if (unitsKey(p) === kind && slotOf[j] < 0 && from >= 0 && play(state, move)) return move;
    }
    for (const cell of cells) {
      const o = topIn(w, cell);
      if (o >= first && blockers.size && [...blockers].some((j) => voxelsOf(state.tray[j]).some((v) => v.cell === cell))) return lift(cell);
    }
    // Nothing in the way: a piece like it, from the tray first.
    const like = state.tray.flatMap((p, j) => (unitsKey(p) === kind && slotOf[j] < 0 ? [j] : [])),
      source = like.find((j) => state.tray[j].at < 0) ?? like[0];
    if (source === undefined) continue;
    const p = state.tray[source];
    if (p.at < 0) return { from: CELLS + source, to: put(want.at, want.yaw), extra: -1 };
    return takeUp(source) ?? { from: handle(state, w, source), to: put(want.at, want.yaw), extra: -1 };
  }
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
  hint: () => "쟁반의 부품을 판에 끌어다 놓고 눌러 돌린 뒤, 깔때기를 눌러 구슬을 넣으세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 구슬이 모든 부품을 지나 도착 컵에 들어갔습니다." : `실패! ${s.trouble?.words ?? ""}`),
};
