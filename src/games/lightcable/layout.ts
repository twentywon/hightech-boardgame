import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../engine/camera";
import type { TableSubject } from "../table/view";
import {
  CCW,
  CW,
  DEPTH,
  PLUG,
  UNWRAP,
  WIDTH,
  angleAt,
  arcOf,
  arcPoint,
  cableOf,
  decode,
  pivotOf,
  pointAnchor,
  tangent,
  turnOf,
  type Pt,
  type Side,
  type State,
} from "./rules";
import type { Move } from "../points/types";

/*
 * Where things lie on the workshop board, in table units, shared by the view and the browser tests (free of anything
 * Vite-only). The board lies flat with its middle at the table's middle: x to the right, z toward the player, the
 * same units as the rules.
 */
/** The height of the board's face, where the cable lies and the pointer is followed. */
export const BOARD_TOP = 0,
  /** How thick the cable is, and so the height of its middle. */
  CABLE_R = 0.065,
  CABLE_Y = BOARD_TOP + CABLE_R,
  /** How near the free end a press takes it up, and how near the exit a dropped end goes in. */
  GRAB = 0.7,
  EXIT_GRAB = 0.5,
  /** How far the free end is kept inside the board's edge. */
  EDGE = 0.12;
/** What the camera frames (browser tests aim with it too): the board and its frame, seen steeply from the near side. */
export function cableSubject(aspect: number): TableSubject {
  const half = WIDTH + 0.45,
    halfZ = DEPTH + 0.45;
  return { half: aspect < 1 ? half : half + 0.1, halfZ, height: 0.85, lookY: 0, tilt: 1.13 };
}
/** The camera the table is seen through, for a canvas of `aspect` (the same as `TableView` sets). */
export function cableCamera(aspect: number) {
  const subject = cableSubject(aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  return camera;
}
/** Where a place on the board (at height `y`) is in a canvas of `width` × `height` CSS pixels. */
export function toScreen(width: number, height: number, p: Pt, y = BOARD_TOP) {
  const v = new Vector3(p.x, y, p.z).project(cableCamera(width / height));
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}
/** A cable point: where it is, its colour there and how far along the cable from the start it is. */
export interface CablePoint extends Pt {
  tint: number;
  along: number;
}
/** How far apart the points of the cable's line are. */
const STEP = 0.04;
function push(out: CablePoint[], p: Pt, tint: number) {
  const last = out[out.length - 1];
  out.push({ x: p.x, z: p.z, tint, along: last ? last.along + Math.hypot(p.x - last.x, p.z - last.z) : 0 });
}
function line(out: CablePoint[], a: Pt, b: Pt, tint: number) {
  const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
  if (!out.length) push(out, a, tint);
  for (let i = 1; i <= k; i++) push(out, { x: a.x + ((b.x - a.x) * i) / k, z: a.z + ((b.z - a.z) * i) / k }, tint);
}
function arc(out: CablePoint[], a: ReturnType<typeof arcOf>, tint: number) {
  const k = Math.max(2, Math.ceil((a.sweep * a.r) / STEP));
  for (let i = 1; i <= k; i++) push(out, arcPoint(a, i / k), tint);
}
/**
 * The cable's middle line as points close together: from the start along the fixed runs and round the wrapped posts
 * up to where it arrives at the last one (`fixed`), and from there round the last post and along the free run to
 * `end` (`free`, which starts where `fixed` stops). Each point carries the cable's colour there: a ring turns it from
 * where the cable arrives at the ring.
 */
export function cableLines(state: State, end: Pt) {
  const { runs, arcs, tints } = cableOf(state, end),
    fixed: CablePoint[] = [],
    free: CablePoint[] = [],
    count = state.wraps.length;
  // The fixed runs: run i ends where the cable arrives at wrap i (and after it comes that wrap's arc).
  for (let i = 0; i < Math.min(count, runs.length); i++) {
    line(fixed, runs[i].a, runs[i].b, tints[i]);
    if (i + 1 < count && arcs[i]) arc(fixed, arcs[i], tints[i + 1]);
  }
  if (!fixed.length) push(fixed, state.start, tints[0] ?? 0);
  const tail = fixed[fixed.length - 1];
  free.push({ ...tail });
  if (count && arcs[count - 1]) arc(free, arcs[count - 1], state.tint);
  const run = runs[count];
  if (run) line(free, run.a, run.b, state.tint);
  else push(free, end, state.tint);
  return { fixed, free };
}
/** The free run of `state` toward `end` (null when the end lies inside the last post). */
export function freeRun(state: State, end: Pt) {
  return tangent(pivotOf(state), pointAnchor(end));
}
/**
 * How far round the last wrapped post the cable bends with the free end at `end`, in [0, 2π): the angle from where
 * it arrives to where it leaves for the end, the way the wrap goes. The view follows it continuously and frees the
 * wrap when it turns back through zero.
 */
export function bendAt(state: State, end: Pt) {
  const count = state.wraps.length;
  if (!count) return 0;
  const { runs } = cableOf(state),
    last = state.wraps[count - 1],
    post = state.posts[last.post],
    run = tangent(pivotOf(state), pointAnchor(end));
  if (!run) return 0;
  return arcOf(last.post, post, last.side, runs[count - 1].b, run.a).sweep;
}
/** Where the free end rests by the cable of `state`, a little round its last post (beside the start when bare). */
export function restEnd(state: State): Pt {
  const count = state.wraps.length;
  if (state.winner === 0) return { ...state.exit };
  if (!count) return { x: state.start.x + 0.45, z: state.start.z };
  const { runs } = cableOf(state),
    last = state.wraps[count - 1],
    post = state.posts[last.post],
    rho = post.r + 0.3,
    arrive = runs[count - 1].b;
  return round(post, angleAt(post, arrive), last.side, rho, 0.9);
}
/** The free end, at `rho` from a post's middle, placed so that the cable bends `bend` round it past `from`. */
function round(post: Pt & { r: number }, from: number, side: number, rho: number, bend: number): Pt {
  const angle = from + side * bend + side * Math.acos(Math.min(1, post.r / rho));
  return { x: post.x + Math.cos(angle) * rho, z: post.z + Math.sin(angle) * rho };
}
/**
 * The way to draw the free end (from `end`) so that the cable of `state` makes `move`, as places on the board one
 * after another (for the browser tests, and the same way the hint's arrow shows): the end is brought in close to the
 * cable's last post, swung round it until the free run points just past the post to wrap (on the far side from the
 * way it must be caught), drawn out beyond that post and then swept across onto it, which catches it on the side
 * asked for and leaves the end resting a little round it. A plug swings round toward the exit and goes into it; an
 * unwrap swings back past straight.
 */
export function reachFor(state: State, end: Pt, move: Move): Pt[] {
  const m = decode(move, state.posts.length);
  if (!m) return [];
  const out: Pt[] = [],
    count = state.wraps.length,
    pivot = pivotOf(state),
    last = count ? state.wraps[count - 1] : null,
    rho = last ? pivot.r + 0.3 : 0.45;
  // 1. In along the free run, to `rho` from the pivot's middle.
  const run = freeRun(state, end);
  if (!run) return out;
  const far = Math.hypot(end.x - pivot.x, end.z - pivot.z);
  if (far > rho + 0.02) {
    const dx = end.x - run.a.x,
      dz = end.z - run.a.z,
      length = Math.hypot(dx, dz),
      keep = Math.sqrt(Math.max(0, rho * rho - pivot.r * pivot.r));
    out.push({ x: run.a.x + (dx / length) * keep, z: run.a.z + (dz / length) * keep });
  } else out.push({ ...end });
  // Where the free run must point, and where the end goes after.
  let aim: Pt,
    after: Pt[] = [];
  if (m.kind === "plug") aim = state.exit;
  else if (m.kind === "unwrap") aim = { x: NaN, z: NaN };
  else {
    const post = state.posts[m.post],
      tan = tangent(pivot, { x: post.x, z: post.z, r: post.r, s: m.side })!,
      ux = (tan.b.x - tan.a.x) / Math.hypot(tan.b.x - tan.a.x, tan.b.z - tan.a.z),
      uz = (tan.b.z - tan.a.z) / Math.hypot(tan.b.x - tan.a.x, tan.b.z - tan.a.z),
      // The right of the run; the post's middle is on side `m.side` of it.
      nx = -uz,
      nz = ux,
      beside = { x: tan.b.x - m.side * nx * 0.06, z: tan.b.z - m.side * nz * 0.06 },
      bx = beside.x - tan.a.x,
      bz = beside.z - tan.a.z,
      bl = Math.hypot(bx, bz);
    aim = { x: beside.x + (bx / bl) * 0.35, z: beside.z + (bz / bl) * 0.35 };
    after = [
      { x: post.x + ux * 0.35 + m.side * nx * 0.12, z: post.z + uz * 0.35 + m.side * nz * 0.12 },
      { x: post.x + ux * 0.35 + m.side * nx * 0.35, z: post.z + uz * 0.35 + m.side * nz * 0.35 },
    ];
  }
  // 2. Round the pivot at `rho`, from the bend it has to the bend that points the free run at `aim`.
  const at = out[out.length - 1];
  if (last) {
    const post = state.posts[last.post],
      from = angleAt(post, cableOf(state).runs[count - 1].b),
      bendNow = bendAt(state, at),
      target = m.kind === "unwrap" ? -0.5 : bendAt(state, aim),
      steps = Math.max(2, Math.ceil(Math.abs(target - bendNow) / 0.35));
    for (let i = 1; i <= steps; i++) out.push(round(post, from, last.side, rho, bendNow + ((target - bendNow) * i) / steps));
  } else if (m.kind !== "unwrap") {
    const a0 = angleAt(state.start, at),
      a1 = angleAt(state.start, aim),
      turn = turnOf(a1 - a0 + Math.PI) - Math.PI,
      steps = Math.max(2, Math.ceil(Math.abs(turn) / 0.35));
    for (let i = 1; i <= steps; i++) {
      const a = a0 + (turn * i) / steps;
      out.push({ x: state.start.x + Math.cos(a) * rho, z: state.start.z + Math.sin(a) * rho });
    }
  }
  if (m.kind === "unwrap") return out;
  // 3. Out along that line to the aim, then (for a wrap) across onto the post.
  out.push(aim, ...after);
  return out;
}
/** The side a hinted wrap goes round, for the words and the arrow. */
export const sideName = (side: Side) => (side === CW ? "시계 방향" : side === CCW ? "반시계 방향" : "");
export { PLUG, UNWRAP };
