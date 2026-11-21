import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 빛 케이블 (LIGHT CABLE), a taut-cable puzzle of the kind of the game 'Filament': a cable is pulled from a socket
 * round brass posts standing on a dark board, as a string is pulled round nails, and every post it wraps lights up.
 * Only the kind of puzzle was taken; the name, the boards, the rules in detail and the look are our own.
 *
 * Geometry (pure 2D, x to the right and z toward the player, in board units; nothing here knows Three.js or the DOM):
 * - The board is `2 * width` by `2 * depth`, its middle at (0, 0). On it stand round posts (`posts`, a centre and the
 *   radius the cable's middle line keeps from it), the hazards (`hazards`, high-voltage coils, a centre and a radius
 *   the cable's middle line must stay outside), the start socket `start` (the cable's fixed end) and the exit socket
 *   `exit`, both points.
 * - Posts are of four kinds: `plain` (white, must be lit), `coloured` (red, blue or green, must be lit, and only by a
 *   cable of its colour), `ring` (a small peg that turns the cable its colour from where it is wrapped on; it needs no
 *   lighting) and `counted` (white, must be wrapped `need` separate times, its number shown).
 * - The cable is the taut string: start → a list of wraps (`wraps`: a post and a side, `CW` clockwise or `CCW`
 *   anticlockwise as seen from above) → its free end (which only the view knows: where the hand left it). Between
 *   two wraps it runs along the common tangent of the two circles that fits their sides (`tangent`: an outer tangent
 *   for the same side, an inner one for opposite sides; the start, the exit and the free end are points), and round
 *   each wrapped post it follows the circle from where it arrives to where it leaves, the way its side says (`Arc`).
 *   The runs up to the last wrap are fixed; the run from the last wrap to the free end is free.
 *
 * Lighting: a post is lit when the cable wraps it (bends round it); a straight run that only passes near it does not
 * light it. The cable starts white. Wrapping a ring turns the cable the ring's colour from that wrap on. A plain or
 * counted post counts every wrap; a coloured post counts a wrap only when the cable arriving at it is already of its
 * colour (it is not refused otherwise: it simply stays dark). A plain or coloured post is lit by one wrap that counts,
 * a counted post by `need` of them (`counts`). Taking a wrap back (an unwrap or undo) puts its light out again.
 *
 * Moves (every one goes through `play`; `from` is always -1):
 * - WRAP `{from: -1, to: post * 2 + (side === CW ? 0 : 1), extra: -1}`: the cable has caught `post` on `side`. The new
 *   fixed run is the tangent from the last wrap (or the start) to that post. Refused when it is the post wrapped last
 *   (the same post twice in a row), when the run passes through another post (`THROUGH`: deeper than a hair inside it;
 *   that post would have caught the cable first), and, on a stage where the cable may not cross itself (`crossing`
 *   false: 어려움 and above), when the run crosses an earlier fixed run (the run coming into the last post included,
 *   which it crosses when the cable goes more than half round that post).
 * - UNWRAP `{from: -1, to: UNWRAP (-2), extra: -1}`: the last wrap comes free. Refused with nothing wrapped.
 * - PLUG `{from: -1, to: PLUG (-3), extra: -1}`: the free end goes into the exit. Refused, with words naming what is left,
 *   while a post that must be lit is not; then refused when the run from the last wrap to the exit passes through a
 *   post or touches a hazard, or (where crossing is forbidden) crosses an earlier run. Otherwise it wins (`winner` 0).
 * A wrap whose new fixed run (or the arc it fixes round the post before it) touches a hazard is a short circuit: the
 * move is made and the puzzle is failed (`winner` 1, `trouble` "케이블이 고압 코일에 닿았습니다"), to be taken back
 * with undo. The free run may lie across a coil while it is being dragged: it is not fixed yet.
 *
 * The view turns the hand's continuous motion into these moves: as the free end moves, the free run sweeps; a post
 * it comes to touch is caught on the side it was approached from (the first one the sweep meets when several are met
 * at once, by angle from the pivot), and the last wrap comes free when the bend round it turns back past straight
 * (its arc shrinks through zero). `undo` replays the moves made (`history`) but the last.
 *
 * A puzzle is laid at random (`createGame`): posts are scattered apart, a route through them all (an order and a side
 * for each, a counted post visited `need` times, then the exit) is drawn that keeps clear of every other post and
 * never crosses itself, plain posts it reaches on a cable a ring has coloured may be given that colour, coils are set close beside the route but clear of
 * it where they block the most other runs, and the board is kept when the search (`solve`) finds a way through on its own
 * and a random wrapper (wrapping, in a random order on random sides, posts that still need it) seldom gets through
 * (`luck`); the route, replayed through `play`, solves it and is kept as `plan`. The hint follows the plan while the
 * cable does, else a bounded depth-first search over (next post, side) (`solve`, its way kept to while it is followed,
 * so that the hints agree); it frees the last wrap when the cable cannot be finished, and plugs in when only the exit
 * is left.
 */
export const WHITE = 0,
  RED = 1,
  BLUE = 2,
  GREEN = 3;
/** The colours' names, for the words. */
export const COLOUR_NAMES = ["흰", "빨간", "파란", "초록"];
export const CW = 1,
  CCW = -1;
export type Side = 1 | -1;
export type Kind = "plain" | "coloured" | "ring" | "counted";
/** The moves that name no post. */
export const UNWRAP = -2,
  PLUG = -3;
/** How far a run may dip into a post it passes before it counts as passing through it (the hand is not exact). */
export const THROUGH = 0.04;
/** The radius the cable's middle keeps from a post, a ring, and the radius of a hazard it must keep outside. */
export const POST_R = 0.24,
  RING_R = 0.17,
  HAZARD_R = 0.3;

export interface Pt {
  x: number;
  z: number;
}
export interface Post extends Pt {
  r: number;
  kind: Kind;
  colour: number;
  /** Wraps that count, to be lit: 1, or 2 or 3 for a counted post; 0 for a ring. */
  need: number;
}
export interface Hazard extends Pt {
  r: number;
}
export interface Wrap {
  post: number;
  side: Side;
}
export interface Last {
  kind: "wrap" | "unwrap" | "plug";
  /** The post wrapped or freed (-1 for a plug). */
  post: number;
  /** Posts this move lit, and those it put out. */
  lit: number[];
  dimmed: number[];
  /** A short circuit. */
  short: boolean;
}
export interface Board {
  stage: number;
  /** Half the board's width (x) and depth (z). */
  width: number;
  depth: number;
  posts: Post[];
  hazards: Hazard[];
  start: Pt;
  exit: Pt;
  /** Whether the cable may cross itself on this board. */
  crossing: boolean;
  /** A way through found as the board was laid; the hint follows it while the cable does. */
  plan: Move[];
}
export interface State extends Board {
  wraps: Wrap[];
  /** The moves made, for undo by replay. */
  history: Move[];
  /** For each post, the wraps that count toward lighting it. */
  counts: number[];
  /** The cable's colour after its last wrap. */
  tint: number;
  trouble: string;
  last: Last | null;
  winner: Winner;
  ply: number;
}

// --- Geometry ------------------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
/** An angle brought into [0, 2π). */
export const turnOf = (a: number) => ((a % TAU) + TAU) % TAU;
/** An angle brought into (−π, π]. */
export const wrapPi = (a: number) => {
  const t = turnOf(a);
  return t > Math.PI ? t - TAU : t;
};
/** A circle the cable bends round on a side (`s`: +1 clockwise, −1 anticlockwise, seen from above), or a point (`r` 0). */
export interface Anchor extends Pt {
  r: number;
  s: number;
}
/** A straight stretch of cable, from `a` to `b`. */
export interface Run {
  a: Pt;
  b: Pt;
}
/** The cable round a wrapped post: from the angle `from` (where it arrives) for `sweep` radians the way `s` says. */
export interface Arc {
  post: number;
  x: number;
  z: number;
  r: number;
  s: number;
  from: number;
  sweep: number;
}
/**
 * The stretch of cable from anchor `a` to anchor `b` that leaves `a` and reaches `b` on their sides: the common
 * tangent with `a`'s centre on side `a.s` of it and `b`'s on side `b.s` (a positive side is the right of the way the
 * cable runs, so that it turns clockwise round that circle). Null when there is none (one circle inside the other).
 */
export function tangent(a: Anchor, b: Anchor): Run | null {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length = Math.hypot(dx, dz),
    k = b.s * b.r - a.s * a.r;
  if (length < 1e-9 || Math.abs(k) >= length) return null;
  const phi = Math.asin(-k / length),
    ux = dx / length,
    uz = dz / length,
    c = Math.cos(phi),
    s = Math.sin(phi),
    // The way the cable runs: the line between the centres turned by phi (positive turns clockwise, seen from above).
    wx = ux * c - uz * s,
    wz = ux * s + uz * c,
    // The right of that way.
    nx = -wz,
    nz = wx;
  return { a: { x: a.x - a.s * a.r * nx, z: a.z - a.s * a.r * nz }, b: { x: b.x - b.s * b.r * nx, z: b.z - b.s * b.r * nz } };
}
/** How far a point is from a stretch of cable. */
export function segmentDistance(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    span = dx * dx + dz * dz,
    t = span > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / span)) : 0;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
}
/** Whether two stretches cross each other (touching at an end does not count). */
export function crosses(a: Pt, b: Pt, c: Pt, d: Pt) {
  const rx = b.x - a.x,
    rz = b.z - a.z,
    sx = d.x - c.x,
    sz = d.z - c.z,
    den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return false;
  const qx = c.x - a.x,
    qz = c.z - a.z,
    t = (qx * sz - qz * sx) / den,
    u = (qx * rz - qz * rx) / den,
    eps = 1e-4;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}
/** The angle of a point round a centre. */
export const angleAt = (c: Pt, p: Pt) => Math.atan2(p.z - c.z, p.x - c.x);
/** The arc round a post between where the cable arrives and where it leaves. */
export function arcOf(post: number, centre: Post, s: number, arrive: Pt, leave: Pt): Arc {
  const from = angleAt(centre, arrive);
  return { post, x: centre.x, z: centre.z, r: centre.r, s, from, sweep: turnOf(s * (angleAt(centre, leave) - from)) };
}
/** How far a point is from an arc of cable. */
export function arcDistance(p: Pt, arc: Arc) {
  const rel = turnOf(arc.s * (angleAt(arc, p) - arc.from));
  if (rel <= arc.sweep) return Math.abs(Math.hypot(p.x - arc.x, p.z - arc.z) - arc.r);
  const end = arc.from + arc.s * arc.sweep;
  return Math.min(
    Math.hypot(p.x - (arc.x + Math.cos(arc.from) * arc.r), p.z - (arc.z + Math.sin(arc.from) * arc.r)),
    Math.hypot(p.x - (arc.x + Math.cos(end) * arc.r), p.z - (arc.z + Math.sin(end) * arc.r)),
  );
}
/** A point on an arc, `t` of the way along it. */
export const arcPoint = (arc: Arc, t: number): Pt => {
  const a = arc.from + arc.s * arc.sweep * t;
  return { x: arc.x + Math.cos(a) * arc.r, z: arc.z + Math.sin(a) * arc.r };
};
/** The anchor of a wrap, or of a point. */
export const anchorOf = (board: Pick<Board, "posts">, wrap: Wrap): Anchor => {
  const p = board.posts[wrap.post];
  return { x: p.x, z: p.z, r: p.r, s: wrap.side };
};
export const pointAnchor = (p: Pt): Anchor => ({ x: p.x, z: p.z, r: 0, s: 0 });
/** The anchor the free run leaves from: the last wrap, or the start. */
export const pivotOf = (state: Pick<State, "posts" | "wraps" | "start">): Anchor =>
  state.wraps.length ? anchorOf(state, state.wraps[state.wraps.length - 1]) : pointAnchor(state.start);
/**
 * The cable of `state` as runs and arcs: the fixed runs (run i from anchor i to anchor i + 1, the start being anchor
 * 0), then, when `end` is given, the free run to it (null runs are left out: an end inside the last post); an arc
 * for every wrap that has a run on both sides. `tints[i]` is the colour of run i (and of the arc after it).
 */
export function cableOf(state: Pick<State, "posts" | "wraps" | "start">, end: Pt | null = null) {
  const anchors = [pointAnchor(state.start), ...state.wraps.map((w) => anchorOf(state, w))];
  if (end) anchors.push(pointAnchor(end));
  const runs: Run[] = [],
    arcs: Arc[] = [],
    tints: number[] = [];
  let tint = WHITE;
  for (let i = 0; i + 1 < anchors.length; i++) {
    const run = tangent(anchors[i], anchors[i + 1]);
    if (!run) break;
    tints.push(tint);
    if (i > 0) {
      const wrap = state.wraps[i - 1];
      arcs.push(arcOf(wrap.post, state.posts[wrap.post], wrap.side, runs[i - 1].b, run.a));
    }
    runs.push(run);
    const wrap = state.wraps[i];
    if (wrap && state.posts[wrap.post].kind === "ring") tint = state.posts[wrap.post].colour;
  }
  // The arc colours follow the run after them; the colour after the last wrap is the free run's.
  return { runs, arcs, tints };
}
/** The posts (indices) a stretch passes through, apart from those in `skip`. */
function through(posts: Post[], run: Run, skip: number[], margin = -THROUGH) {
  const out: number[] = [];
  posts.forEach((p, i) => {
    if (!skip.includes(i) && segmentDistance(p, run.a, run.b) < p.r + margin) out.push(i);
  });
  return out;
}
/** Whether a stretch, or an arc, comes within `margin` of a hazard (0: touches it). */
const touchesRun = (hazards: Hazard[], run: Run, margin = 0) => hazards.some((h) => segmentDistance(h, run.a, run.b) < h.r + margin);
const touchesArc = (hazards: Hazard[], arc: Arc, margin = 0) => hazards.some((h) => arcDistance(h, arc) < h.r + margin);

// --- Lighting and moves --------------------------------------------------------------------------------------------

/** The wraps that count for each post, and the cable's colour after the last. */
export function trace(board: Pick<Board, "posts">, wraps: Wrap[]) {
  const counts = board.posts.map(() => 0);
  let tint = WHITE;
  for (const w of wraps) {
    const p = board.posts[w.post];
    if (p.kind === "ring") tint = p.colour;
    else if (p.kind !== "coloured" || p.colour === tint) counts[w.post]++;
  }
  return { counts, tint };
}
/** Whether a post must be lit (rings need not). */
export const mustLight = (post: Post) => post.kind !== "ring";
export const isLit = (state: Pick<State, "posts" | "counts">, i: number) => mustLight(state.posts[i]) && state.counts[i] >= state.posts[i].need;
export const unlitCount = (state: Pick<State, "posts" | "counts">) => state.posts.reduce((sum, p, i) => sum + (mustLight(p) && !isLit(state, i) ? 1 : 0), 0);

export const wrapMove = (post: number, side: Side): Move => ({ from: -1, to: post * 2 + (side === CW ? 0 : 1), extra: -1 });
export const unwrapMove = (): Move => ({ from: -1, to: UNWRAP, extra: -1 });
export const plugMove = (): Move => ({ from: -1, to: PLUG, extra: -1 });
export type Decoded = { kind: "wrap"; post: number; side: Side } | { kind: "unwrap" } | { kind: "plug" };
/** What a move is, or null when it is no move of this game. */
export function decode(move: Move, posts = Infinity): Decoded | null {
  if (move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  if (move.to === UNWRAP) return { kind: "unwrap" };
  if (move.to === PLUG) return { kind: "plug" };
  if (move.to < 0 || move.to >= posts * 2) return null;
  return { kind: "wrap", post: move.to >> 1, side: move.to & 1 ? CCW : CW };
}
/**
 * What is wrong with a wrap of `post` on `side` from the cable of `state`: "same", "through" or "cross" when it is
 * refused; "short" when it is made but touches a coil; "" when it is fine. `margin` (for the search and the
 * generator) keeps runs that far clear of posts and coils besides.
 */
export function judgeWrap(state: State, post: number, side: Side, margin = 0): "" | "same" | "through" | "cross" | "short" | "none" {
  const wraps = state.wraps,
    last = wraps.length ? wraps[wraps.length - 1] : null;
  if (last && last.post === post) return "same";
  const pivot = pivotOf(state),
    run = tangent(pivot, anchorOf(state, { post, side }));
  if (!run) return "none";
  const skip = last ? [post, last.post] : [post];
  if (through(state.posts, run, skip, margin > 0 ? margin : -THROUGH).length) return "through";
  if (!state.crossing && crossesCable(state, run)) return "cross";
  if (touchesRun(state.hazards, run, margin)) return "short";
  if (last) {
    const { runs } = cableOf(state),
      arrive = runs[runs.length - 1].b;
    if (touchesArc(state.hazards, arcOf(last.post, state.posts[last.post], last.side, arrive, run.a), margin)) return "short";
  }
  return "";
}
/** Whether a new run crosses one of the fixed runs of the cable. */
function crossesCable(state: State, run: Run) {
  const { runs } = cableOf(state);
  return runs.some((r) => crosses(r.a, r.b, run.a, run.b));
}
/** What is wrong with plugging in: "unlit", "through", "hazard" or "cross"; "" when it may be done. */
export function judgePlug(state: State, margin = 0): "" | "unlit" | "through" | "hazard" | "cross" | "none" {
  if (unlitCount(state)) return "unlit";
  const pivot = pivotOf(state),
    run = tangent(pivot, pointAnchor(state.exit));
  if (!run) return "none";
  const last = state.wraps[state.wraps.length - 1];
  if (through(state.posts, run, last ? [last.post] : [], margin > 0 ? margin : -THROUGH).length) return "through";
  if (touchesRun(state.hazards, run, margin)) return "hazard";
  if (last) {
    const { runs } = cableOf(state);
    if (touchesArc(state.hazards, arcOf(last.post, state.posts[last.post], last.side, runs[runs.length - 1].b, run.a), margin)) return "hazard";
  }
  if (!state.crossing && crossesCable(state, run)) return "cross";
  return "";
}
/** Why a move is refused, in words, or null. */
export function refusal(state: State, move: Move): string | null {
  if (state.winner !== null) return null;
  const m = decode(move, state.posts.length);
  if (!m) return null;
  if (m.kind === "unwrap") return state.wraps.length ? null : "감긴 기둥이 없습니다.";
  if (m.kind === "plug") {
    const why = judgePlug(state);
    if (why === "unlit") {
      const left = unlitCount(state);
      return `아직 불이 들어오지 않은 기둥이 ${left}개 있습니다. 모두 밝힌 다음 출구에 꽂으세요.`;
    }
    if (why === "through" || why === "none") return "출구까지 가는 케이블이 기둥에 걸립니다. 기둥을 피해 출구로 끄세요.";
    if (why === "hazard") return "출구까지 가는 케이블이 고압 코일에 닿습니다. 코일을 피해 출구로 끄세요.";
    if (why === "cross") return "케이블이 서로 겹칠 수 없습니다. 이 단계에서는 케이블이 자기 자신을 가로지르면 안 됩니다.";
    return null;
  }
  const why = judgeWrap(state, m.post, m.side);
  if (why === "same") return "방금 감은 기둥입니다. 같은 기둥을 연달아 감을 수는 없습니다.";
  if (why === "through" || why === "none") return "케이블이 다른 기둥을 뚫고 지나갈 수 없습니다.";
  if (why === "cross") return "케이블이 서로 겹칠 수 없습니다. 이 단계에서는 케이블이 자기 자신을 가로지르면 안 됩니다.";
  return null;
}
const changed = (before: number[], after: Pick<State, "posts" | "counts">, beforeState: Pick<State, "posts" | "counts">) => ({
  lit: before.flatMap((_, i) => (!isLit(beforeState, i) && isLit(after, i) ? [i] : [])),
  dimmed: before.flatMap((_, i) => (isLit(beforeState, i) && !isLit(after, i) ? [i] : [])),
});
export const SHORT = "케이블이 고압 코일에 닿았습니다";
/** The state after a move, or null when it may not be made. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null) return null;
  const m = decode(move, state.posts.length);
  if (!m) return null;
  const ply = state.ply + 1,
    history = [...state.history, move];
  if (m.kind === "plug") {
    if (judgePlug(state)) return null;
    return { ...state, history, winner: 0, trouble: "", last: { kind: "plug", post: -1, lit: [], dimmed: [], short: false }, ply };
  }
  if (m.kind === "unwrap") {
    if (!state.wraps.length) return null;
    const wraps = state.wraps.slice(0, -1),
      { counts, tint } = trace(state, wraps),
      next = { ...state, wraps, counts, tint },
      { lit, dimmed } = changed(state.counts, next, state);
    return { ...next, history, trouble: "", last: { kind: "unwrap", post: state.wraps[state.wraps.length - 1].post, lit, dimmed, short: false }, ply };
  }
  const why = judgeWrap(state, m.post, m.side);
  if (why && why !== "short") return null;
  const wraps = [...state.wraps, { post: m.post, side: m.side }],
    { counts, tint } = trace(state, wraps),
    next = { ...state, wraps, counts, tint },
    { lit, dimmed } = changed(state.counts, next, state),
    short = why === "short";
  return { ...next, history, trouble: short ? SHORT : "", winner: short ? 1 : null, last: { kind: "wrap", post: m.post, lit, dimmed, short }, ply };
}
/** The legal moves: every wrap `play` makes (a short circuit included), the unwrap, and the plug when it may be made. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  state.posts.forEach((_, post) => {
    for (const side of [CW, CCW] as Side[]) {
      const why = judgeWrap(state, post, side);
      if (!why || why === "short") out.push(wrapMove(post, side));
    }
  });
  if (state.wraps.length) out.push(unwrapMove());
  if (!judgePlug(state)) out.push(plugMove());
  return out;
}
/** A board as laid, nothing wrapped. */
export function fresh(board: Board): State {
  return { ...board, wraps: [], history: [], counts: board.posts.map(() => 0), tint: WHITE, trouble: "", last: null, winner: null, ply: 0 };
}
/** The state with the last move taken back, replayed from the board as laid. */
export function undo(state: State): State {
  let s = fresh(state);
  for (const move of state.history.slice(0, -1)) s = play(s, move) ?? s;
  return s;
}

// --- Search --------------------------------------------------------------------------------------------------------

/** How far the search and the plan keep their runs clear of posts and coils, so that a hand can follow them. */
export const SAFE = 0.08,
  PLAN_SAFE = 0.16;
/** Whether a wrap of `post` would still be of use: it lights something, or turns the cable a colour still wanted. */
function useful(state: State, post: number) {
  const p = state.posts[post];
  if (p.kind === "ring") return p.colour !== state.tint && state.posts.some((q, i) => q.kind === "coloured" && q.colour === p.colour && !isLit(state, i));
  if (isLit(state, post)) return false;
  return p.kind !== "coloured" || p.colour === state.tint;
}
/** How many positions the hint's search may visit. */
const BUDGET = 25000;
/**
 * A way to finish from `state`: the moves to make (wraps, then the plug); [] when it is won, null when the search
 * finds none within its budget. It wraps only posts that are of use (and, once everything is lit, up to two others on
 * the way to the exit), keeps its runs `SAFE` clear of posts and coils, and tries the nearer posts first.
 */
export function solve(state: State, budget = BUDGET, preferPlan = true): Move[] | null {
  if (state.winner === 0) return [];
  if (state.winner !== null) return null;
  const left = { n: budget },
    way: Move[] = [],
    failed = new Set<string>(),
    open = new Set<string>(),
    deepest = state.history.length + state.posts.reduce((sum, p) => sum + Math.max(1, p.need), 0) + 4;
  // Where the cable may cross itself, what is left to do depends only on the last wrap, the colour and what is lit;
  // where it may not, the runs laid matter too, so the whole cable is the key.
  const key = (s: State) => {
    if (!s.crossing) return s.wraps.map((w) => w.post * 2 + (w.side === CW ? 0 : 1)).join(",");
    const w = s.wraps[s.wraps.length - 1];
    return `${w ? w.post * 2 + (w.side === CW ? 0 : 1) : -1}|${s.tint}|${s.counts.join("")}`;
  };
  const search = (s: State, detours: number): boolean => {
    if (--left.n < 0) return false;
    if (!unlitCount(s) && !judgePlug(s, SAFE)) {
      way.push(plugMove());
      return true;
    }
    const k = key(s);
    // A position seen before (or on the way here: a ring and back) is not searched again.
    if (failed.has(k) || open.has(k) || s.history.length > deepest) return false;
    const pivot = pivotOf(s),
      done = !unlitCount(s);
    if (done && detours >= 2) return false;
    const options: { post: number; side: Side; far: number }[] = [];
    s.posts.forEach((p, post) => {
      if (!done && !useful(s, post)) return;
      for (const side of [CW, CCW] as Side[]) {
        if (judgeWrap(s, post, side, SAFE)) continue;
        options.push({ post, side, far: Math.hypot(p.x - pivot.x, p.z - pivot.z) });
      }
    });
    options.sort((a, b) => a.far - b.far || a.post - b.post || b.side - a.side);
    if (preferPlan) {
      const next = s.plan[s.history.length];
      if (next && s.history.every((m, i) => s.plan[i] && m.to === s.plan[i].to)) {
        const at = options.findIndex((o) => wrapMove(o.post, o.side).to === next.to);
        if (at > 0) options.unshift(...options.splice(at, 1));
      }
    }
    open.add(k);
    for (const o of options) {
      const move = wrapMove(o.post, o.side),
        next = play(s, move);
      if (!next || next.winner !== null) continue;
      way.push(move);
      if (search(next, done ? detours + 1 : detours)) return true;
      way.pop();
      if (left.n < 0) break;
    }
    open.delete(k);
    if (left.n >= 0) failed.add(k);
    return false;
  };
  return search(state, 0) ? way : null;
}
/** Whether the moves made so far are the first moves of the plan. */
const onPlan = (state: State) => state.history.length < state.plan.length && state.history.every((m, i) => m.to === state.plan[i].to);
/**
 * The hint: the next move of a way through. While the cable follows the plan, the plan's next move; else the first of a
 * way the search finds; when it finds none, the unwrap (which in the end brings the cable back onto a way that can be
 * finished). Null when it is over.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  if (onPlan(state)) {
    const next = state.plan[state.history.length];
    if (play(state, next)) return next;
  }
  // A way found before for this cable (the hint's own way, followed so far) is kept to, so that the hints agree.
  let ways = found.get(state.posts);
  if (!ways) found.set(state.posts, (ways = new Map()));
  const here = historyKey(state.history),
    known = ways.get(here);
  if (known && known.length && play(state, known[0])) return known[0];
  const way = solve(state);
  if (way && way.length) {
    if (ways.size > 400) ways.clear();
    let key = here;
    way.forEach((move, i) => {
      ways.set(key, way.slice(i));
      key = historyKey([move], key);
    });
    return way[0];
  }
  return state.wraps.length ? unwrapMove() : null;
}
/** Ways the hint has found, by board and by the moves made. */
const found = new WeakMap<Post[], Map<string, Move[]>>();
const historyKey = (moves: Move[], before = "") => moves.reduce((key, m) => `${key},${m.to}`, before);
/**
 * How often a random wrapper gets through: from the start, at each wrap a post that is still of use on a random side,
 * among the wraps `play` would make; a short circuit ends the try. A board where that seldom works is one where the
 * order and the sides must be thought out.
 */
export function luck(state: State, tries: number, random: Random) {
  let won = 0;
  for (let t = 0; t < tries; t++) {
    let s = state;
    for (let guard = 0; guard < 40; guard++) {
      if (!unlitCount(s)) {
        if (!judgePlug(s)) won++;
        break;
      }
      const options: Move[] = [];
      s.posts.forEach((_, post) => {
        if (!useful(s, post)) return;
        for (const side of [CW, CCW] as Side[]) {
          const why = judgeWrap(s, post, side);
          if (!why || why === "short") options.push(wrapMove(post, side));
        }
      });
      if (!options.length) break;
      const next = play(s, options[Math.floor(random() * options.length)])!;
      if (next.winner === 1) break;
      s = next;
    }
  }
  return won / tries;
}

// --- Stages and laying a board -------------------------------------------------------------------------------------

export interface Stage {
  /** Posts that must be lit, how many of them are coloured and how many counted, rings, and coils. */
  posts: [number, number];
  coloured: [number, number];
  counted: [number, number];
  rings: number;
  hazards: [number, number];
  /** Whether the cable may cross itself. */
  crossing: boolean;
  /** How lucky a random wrapper may be on a board kept at once. */
  luck: number;
}
/**
 * The stages. Crossing is allowed on the first two (as in the kind of game, so that a beginner learns the wrapping and
 * the coils first) and forbidden from 어려움 on, where the order of the wraps must then be planned so that no run
 * cuts across another.
 */
export const STAGES: Stage[] = [
  { posts: [4, 5], coloured: [0, 0], counted: [0, 0], rings: 0, hazards: [1, 2], crossing: true, luck: 0.2 },
  { posts: [6, 6], coloured: [0, 0], counted: [0, 0], rings: 0, hazards: [3, 3], crossing: true, luck: 0.08 },
  { posts: [7, 8], coloured: [0, 0], counted: [0, 0], rings: 0, hazards: [3, 4], crossing: false, luck: 0.04 },
  { posts: [6, 7], coloured: [2, 3], counted: [0, 0], rings: 2, hazards: [3, 4], crossing: false, luck: 0.03 },
  { posts: [6, 7], coloured: [2, 2], counted: [1, 2], rings: 2, hazards: [4, 5], crossing: false, luck: 0.02 },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
/** The board's half width and depth, and how far in from its edges posts stand. */
export const WIDTH = 4.2,
  DEPTH = 2.7,
  INSET_X = 0.9,
  INSET_Z = 0.6;
/** The least distance between the middles of two posts, of a post and a ring, and between coils. */
const POST_GAP = 1.15,
  RING_GAP = 1.0;

const between = (range: [number, number], random: Random) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
function shuffle<T>(list: T[], random: Random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
/** A quick generator of numbers in [0, 1) from a 32-bit seed (mulberry32). */
export function quick(seed: number): Random {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** A board from its pieces (tests and the generator). */
export function boardOf(stage: number, posts: Post[], hazards: Hazard[], start: Pt, exit: Pt, plan: Move[] = [], crossing = STAGES[stageOf(stage) - 1].crossing): State {
  return fresh({ stage, width: WIDTH, depth: DEPTH, posts, hazards, start, exit, crossing, plan });
}
/** Posts scattered apart within the board, `count` of them and `rings` rings after; null when they did not fit. */
function scatter(count: number, rings: number, start: Pt, exit: Pt, random: Random): Post[] | null {
  const out: Post[] = [];
  for (let k = 0; k < count + rings; k++) {
    const ring = k >= count;
    let placed = false;
    for (let tries = 0; tries < 300 && !placed; tries++) {
      const x = (random() * 2 - 1) * (WIDTH - INSET_X),
        z = (random() * 2 - 1) * (DEPTH - INSET_Z);
      if (Math.hypot(x - start.x, z - start.z) < 1.0 || Math.hypot(x - exit.x, z - exit.z) < 1.0) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.z - z) < (ring || p.kind === "ring" ? RING_GAP : POST_GAP))) continue;
      out.push({ x, z, r: ring ? RING_R : POST_R, kind: ring ? "ring" : "plain", colour: WHITE, need: ring ? 0 : 1 });
      placed = true;
    }
    if (!placed) return null;
  }
  return out;
}
/** How far round a post the plan's cable may bend at least and at most, so that every wrap is plain to see. */
const BEND = [0.45, 5.0];
/**
 * A route through every post (a counted post `visits[i]` times, never twice in a row), drawn by a depth-first walk
 * that tries nearer posts first, at random, keeping every run `PLAN_SAFE` clear of other posts, never crossing
 * itself, with every bend plain; then on to the exit. Null when none was found within its budget.
 */
function route(board: State, visits: number[], random: Random): Wrap[] | null {
  const left = visits.slice(),
    wraps: Wrap[] = [],
    budget = { n: 1500 };
  const fits = (s: State, post: number, side: Side) => {
    const why = judgeWrap(s, post, side, PLAN_SAFE);
    if (why) return false;
    if (!s.wraps.length) return true;
    // The bend round the post before it.
    const { runs } = cableOf(s),
      last = s.wraps[s.wraps.length - 1],
      run = tangent(pivotOf(s), anchorOf(s, { post, side }))!,
      arc = arcOf(last.post, s.posts[last.post], last.side, runs[runs.length - 1].b, run.a);
    return arc.sweep >= BEND[0] && arc.sweep <= BEND[1];
  };
  const walk = (s: State): boolean => {
    if (--budget.n < 0) return false;
    if (left.every((n) => n === 0)) {
      if (judgePlug({ ...s, counts: s.posts.map((p) => p.need) }, PLAN_SAFE)) return false;
      const last = s.wraps[s.wraps.length - 1];
      if (last) {
        const { runs } = cableOf(s),
          run = tangent(pivotOf(s), pointAnchor(s.exit))!,
          arc = arcOf(last.post, s.posts[last.post], last.side, runs[runs.length - 1].b, run.a);
        if (arc.sweep < BEND[0] || arc.sweep > BEND[1]) return false;
      }
      return true;
    }
    const pivot = pivotOf(s),
      options: { post: number; side: Side; weight: number }[] = [];
    left.forEach((n, post) => {
      if (!n) return;
      const p = s.posts[post],
        far = Math.hypot(p.x - pivot.x, p.z - pivot.z);
      for (const side of [CW, CCW] as Side[]) options.push({ post, side, weight: random() / (far * far) });
    });
    options.sort((a, b) => b.weight - a.weight);
    for (const o of options) {
      if (!fits(s, o.post, o.side)) continue;
      const next: State = { ...s, wraps: [...s.wraps, { post: o.post, side: o.side }] };
      left[o.post]--;
      wraps.push({ post: o.post, side: o.side });
      if (walk(next)) return true;
      wraps.pop();
      left[o.post]++;
      if (budget.n < 0) return false;
    }
    return false;
  };
  return walk({ ...board, crossing: false }) ? wraps : null;
}
/** Every run between two anchors (the start, each post on each side, the exit) that no post stands in, weighted. */
function alternatives(board: State, plan: Wrap[]) {
  const anchors: { anchor: Anchor; post: number }[] = [{ anchor: pointAnchor(board.start), post: -1 }];
  board.posts.forEach((p, post) => {
    for (const s of [CW, CCW]) anchors.push({ anchor: { x: p.x, z: p.z, r: p.r, s }, post });
  });
  anchors.push({ anchor: pointAnchor(board.exit), post: -2 });
  const planned = new Set<string>(),
    seq = [{ post: -1, s: 0 }, ...plan.map((w) => ({ post: w.post, s: w.side })), { post: -2, s: 0 }];
  for (let i = 0; i + 1 < seq.length; i++) planned.add(`${seq[i].post}:${seq[i].s}>${seq[i + 1].post}:${seq[i + 1].s}`);
  const out: { run: Run; weight: number }[] = [];
  for (let i = 0; i < anchors.length; i++)
    for (let j = 1; j < anchors.length; j++) {
      const a = anchors[i],
        b = anchors[j];
      if (i === j || a.post === b.post || b.post === -1 || a.post === -2) continue;
      if (planned.has(`${a.post}:${a.anchor.s}>${b.post}:${b.anchor.s}`)) continue;
      const run = tangent(a.anchor, b.anchor);
      if (!run) continue;
      const skip = [a.post, b.post].filter((p) => p >= 0);
      if (through(board.posts, run, skip).length) continue;
      const length = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z);
      out.push({ run, weight: 1 / (0.6 + length) });
    }
  return out;
}
/**
 * Coils for a board with a planned cable: points kept clear of the posts, the sockets, the plan's runs and arcs (by
 * `PLAN_SAFE`) and each other, chosen one by one among the few that cut the most runs the plan does not use.
 */
function placeHazards(board: State, plan: Wrap[], count: number, random: Random): Hazard[] {
  const planned = cableOf({ ...board, wraps: plan }, board.exit),
    pool = alternatives(board, plan),
    out: Hazard[] = [];
  const candidates: Hazard[] = [];
  for (let k = 0; k < 160; k++) {
    const h = { x: (random() * 2 - 1) * (WIDTH - 0.6), z: (random() * 2 - 1) * (DEPTH - 0.45), r: HAZARD_R };
    if (board.posts.some((p) => Math.hypot(p.x - h.x, p.z - h.z) < p.r + h.r + 0.18)) continue;
    if (Math.hypot(h.x - board.start.x, h.z - board.start.z) < 0.75 || Math.hypot(h.x - board.exit.x, h.z - board.exit.z) < 0.75) continue;
    if (planned.runs.some((r) => segmentDistance(h, r.a, r.b) < h.r + PLAN_SAFE)) continue;
    if (planned.arcs.some((a) => arcDistance(h, a) < h.r + PLAN_SAFE)) continue;
    candidates.push(h);
  }
  let weights = pool.map((p) => p.weight);
  for (let k = 0; k < count; k++) {
    const scored = candidates
      .filter((h) => !out.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < h.r + o.r + 0.4))
      .map((h) => ({ h, score: pool.reduce((sum, p, i) => sum + (segmentDistance(h, p.run.a, p.run.b) < h.r ? weights[i] : 0), 0) }))
      .sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score <= 0) break;
    const pick = scored[Math.floor(random() * Math.min(3, scored.length))].h;
    out.push(pick);
    // Runs already cut count far less for the next coil.
    weights = weights.map((w, i) => (segmentDistance(pick, pool[i].run.a, pool[i].run.b) < pick.r ? w * 0.15 : w));
  }
  return out;
}
/** A board laid at random for a stage, before it is judged; null when the posts or the route did not come out. */
export function lay(stage: number, random: Random): State | null {
  const spec = STAGES[stage - 1],
    start = { x: -WIDTH + 0.4, z: (random() * 2 - 1) * (DEPTH - 1.0) },
    exit = { x: WIDTH - 0.4, z: (random() * 2 - 1) * (DEPTH - 1.0) },
    count = between(spec.posts, random),
    posts = scatter(count, spec.rings, start, exit, random);
  if (!posts) return null;
  // Counted posts and their visits.
  const counted = shuffle([...Array(count).keys()], random).slice(0, between(spec.counted, random));
  for (const i of counted) {
    posts[i].kind = "counted";
    posts[i].need = random() < 0.3 ? 3 : 2;
    posts[i].r = POST_R + 0.02;
  }
  // Rings get different colours.
  const colours = shuffle([RED, BLUE, GREEN], random);
  posts.forEach((p, i) => {
    if (p.kind === "ring") p.colour = colours[(i - count) % 3];
  });
  const board = boardOf(stage, posts, [], start, exit),
    visits = posts.map((p) => (p.kind === "ring" ? 1 : p.need)),
    wraps = route(board, visits, random);
  if (!wraps) return null;
  // Coloured posts: plain posts the route reaches with a coloured cable, in the colour it then has.
  if (spec.coloured[1]) {
    let tint = WHITE;
    const able: { post: number; colour: number }[] = [];
    for (const w of wraps) {
      const p = posts[w.post];
      if (p.kind === "ring") tint = p.colour;
      else if (p.kind === "plain" && tint !== WHITE) able.push({ post: w.post, colour: tint });
    }
    const want = between(spec.coloured, random),
      chosen = shuffle(able, random).slice(0, want);
    if (chosen.length < spec.coloured[0]) return null;
    for (const c of chosen) {
      posts[c.post].kind = "coloured";
      posts[c.post].colour = c.colour;
    }
    // Every ring must turn some post's cable, or it would be there for nothing.
    if (posts.some((p) => p.kind === "ring" && !posts.some((q) => q.kind === "coloured" && q.colour === p.colour))) return null;
  }
  const hazards = placeHazards(board, wraps, between(spec.hazards, random), random);
  if (hazards.length < spec.hazards[0]) return null;
  const plan = [...wraps.map((w) => wrapMove(w.post, w.side)), plugMove()];
  let s: State = boardOf(stage, posts, hazards, start, exit, plan);
  const laid = s;
  for (const move of plan) {
    const next = play(s, move);
    if (!next || next.winner === 1) return null;
    s = next;
  }
  return s.winner === 0 ? laid : null;
}
/** Random wrappers a board is judged by, and how many boards are tried at most. */
const TRIES = 160,
  BOARDS = 24;
/**
 * A new puzzle of `stage` (1–5): the first board laid on which the random wrapper gets through no more often than the
 * stage allows; failing that, the least lucky of the boards tried. Its plan, replayed through `play`, solves it.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage),
    spec = STAGES[at - 1];
  // One number is drawn from `random`; the many the laying and judging need come from a quick generator seeded with it.
  random = quick(Math.floor(random() * 4294967296));
  let kept: { state: State; luck: number } | null = null;
  for (let k = 0; (k < BOARDS || !kept) && k < BOARDS * 30; k++) {
    const state = lay(at, random);
    // Kept only when the search finds a way on its own too (so that the hint can lead from anywhere).
    if (!state || !solve(state, BUDGET, false)) continue;
    const chance = luck(state, TRIES, random);
    if (chance <= spec.luck) return state;
    if (!kept || chance < kept.luck) kept = { state, luck: chance };
  }
  return kept!.state;
}

const effect = (s: State): Effect | null => (s.last ? { kind: "place", from: -1, to: s.last.post, converted: [], removed: [] } : null);
export const lightCable: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.posts.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -unlitCount(s),
  hint: (s) => {
    const left = unlitCount(s);
    if (!left) return "기둥이 모두 켜졌습니다 · 케이블 끝을 출구 소켓에 꽂으세요";
    return s.wraps.length ? `케이블 끝을 끌어 기둥을 감으세요 · 남은 기둥 ${left}개` : "릴 옆 케이블 끝을 끌어 기둥을 감으세요";
  },
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 기둥을 모두 밝히고 출구에 꽂았습니다." : s.winner === 1 ? `실패! ${s.trouble}.` : ""),
};
