import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Outdoor recurve archery at 70 metres, at a ten-ring face of 122 cm. A shot is a move whose `to` is the point the
 * sight pin was on when the string was let go (millimetres from the middle of the face, y up, to a tenth: `aimCode`)
 * and whose `extra` is how widely the shot scatters round it (one standard deviation, millimetres). A person's shot
 * scatters not at all (0): a person's unsteady hand is the pin trembling while they hold the bow drawn (`tremor` in
 * layout.ts), and the shot names where the pin was. The computer's shots carry its level's scatter, drawn in `play`
 * from the `random` passed in.
 *
 * Where the arrow lands is found in `play` by flying it (`fly`): it leaves the bow at `SPEED`, slowed by the air
 * (drag as the square of its speed through the air) and pulled down by gravity, with the wind of that arrow. The bow
 * is aimed through a sight set for the distance, so that in still air the arrow lands exactly on the pin; the wind
 * carries it off (a cross wind of 1 m/s about 8 cm, a tail wind lifts it a little, a head wind drops it). The winds
 * of every arrow of an end are drawn from the `random` passed in when the end begins (the first end's when the game
 * is made), so that the view shows the wind each arrow will meet and the rules fly it in the same.
 *
 * Two ways to play. The Olympic set system (`match`): sets of three arrows each, shot in turn one arrow at a time; the
 * higher total of a set takes 2 set points, a tie 1 each, and the first to 6 wins. At 5–5 a single arrow each is shot
 * off, the one closer to the middle winning (again if they are exactly as close). Alone (`12`, `36`): ends of six
 * arrows (two ends or six) for a total score.
 */
export type Format = "match" | "12" | "36";
export const FORMATS: { value: Format; label: string }[] = [
  { value: "match", label: "세트제 대결" },
  { value: "12", label: "혼자 12발" },
  { value: "36", label: "혼자 36발" },
];
export const formatOf = (variant: string): Format => (variant === "12" || variant === "36" ? variant : "match");
/** The range: the distance to the face (m), where the arrow leaves the bow and the height of the face's middle (m). */
export const DISTANCE = 70,
  LAUNCH = 1.5,
  CENTRE = 1.3;
/** The arrow: its speed off the string (m/s), how the air slows it (per metre: the drag is DRAG × speed² through the air), gravity. */
export const SPEED = 60,
  DRAG = 0.0019,
  GRAVITY = 9.81;
/** The face, in millimetres: each scoring zone's width, the X ring's radius, the face's radius, and half the side of the boss behind it. */
export const ZONE = 61,
  X_RING = 30.5,
  FACE = 610,
  BOSS = 700;
/** Half the arrow's thickness: an arrow touching a line scores the higher zone. */
export const SHAFT = 2.75;
/** Arrows an archer shoots in an end: three in a set, six alone; the ends alone; the set points that win; the winds that may blow (m/s). */
export const SET_ARROWS = 3,
  END_ARROWS = 6,
  WIN = 6,
  MAX_WIND = 5;
/** The widest scatter a move may name (a person's shots name none). */
export const MAX_SPREAD = 150;
/** The computer's levels: how widely its arrows scatter (mm) and how far off its reading of the wind is (a share of it). */
export const LEVELS: Record<"easy" | "normal" | "hard", { label: string; spread: number; read: number }> = {
  easy: { label: "쉬움", spread: 125, read: 0.5 },
  normal: { label: "보통", spread: 80, read: 0.25 },
  hard: { label: "어려움", spread: 55, read: 0.1 },
};
/** The wind an arrow meets: its speed (m/s, to a tenth) and the way it blows (degrees: 0 toward the target, 90 to the right, 180 back at the archer, 270 to the left). */
export interface Wind {
  speed: number;
  dir: number;
}
export interface Arrow {
  side: 0 | 1;
  /** Where it was aimed, where it was sent (aimed, then scattered by the hand: the same for a person's shot) and where it landed, millimetres from the face's middle (y up). */
  aim: { x: number; y: number };
  sent: { x: number; y: number };
  x: number;
  y: number;
  /** How far from the middle it landed (mm, to a tenth). */
  r: number;
  /** 10 to 1, 0 for a miss; X is a 10 inside the X ring. */
  value: number;
  inner: boolean;
  /** X, 10 … 1, M. */
  label: string;
  /** In the boss (else it flew past it into the grass behind). */
  boss: boolean;
  wind: Wind;
}
/** An end shot: a set of the match, a shoot-off, or an end alone. */
export interface End {
  arrows: Arrow[];
  totals: [number, number];
  /** The set points it gave (nothing alone). */
  points: [number, number];
  shootOff: boolean;
}
export interface State {
  format: Format;
  /** Arrows each archer shoots in an end, and (alone) how many ends there are. */
  perEnd: number;
  ends: number;
  /** Who shoots each arrow of the end under way, and the wind each will meet. */
  order: (0 | 1)[];
  winds: Wind[];
  /** The arrows of the end under way. */
  arrows: Arrow[];
  /** The ends finished, oldest first. */
  history: End[];
  shootOff: boolean;
  setPoints: [number, number];
  /** Every arrow's value added up, each side. */
  totals: [number, number];
  turn: 0 | 1;
  /** The arrow shot last, and whether it finished an end. */
  last: Arrow | null;
  closed: boolean;
  winner: Winner;
  ply: number;
}
const round1 = (v: number) => Math.round(v * 10) / 10;
const other = (side: 0 | 1): 0 | 1 => (side ? 0 : 1);
/**
 * The winds of an end's `count` arrows: a wind for the end (up to about 4 m/s, gentle more often than strong, from any
 * side) that changes from arrow to arrow, a little stronger or weaker and turned a little.
 */
export function drawWinds(count: number, random: Random): Wind[] {
  const base = 0.3 + 4.2 * random() ** 1.3,
    way = random() * 360,
    out: Wind[] = [];
  for (let k = 0; k < count; k++) {
    const speed = Math.min(MAX_WIND, Math.max(0, base * (0.7 + 0.6 * random()))),
      dir = (((way + (random() - 0.5) * 70) % 360) + 360) % 360;
    out.push({ speed: round1(speed), dir: Math.round(dir) % 360 });
  }
  return out;
}
/** A wind's push across (to the right) and along (toward the target), m/s. */
export const windParts = (wind: Wind) => {
  const a = (wind.dir * Math.PI) / 180;
  return { across: wind.speed * Math.sin(a), along: wind.speed * Math.cos(a) };
};
/** A point of an arrow's flight: across (m, right), up (m above the ground), down the range (m), and the time (s). */
export interface FlightPoint {
  x: number;
  y: number;
  d: number;
  t: number;
}
/** One fixed step of the flight (s): small enough that the landing is exact to well within a tenth of a millimetre. */
const STEP = 1 / 250;
/**
 * Flies an arrow launched at `yaw` (radians, to the right) and `pitch` (radians, up) through the `wind` until it
 * reaches the face, and returns where it crosses the face's plane (m across and up, relative to the face's middle),
 * the time it took, its speed there, and (when `keep` is given) its way, a point every `keep` steps.
 */
function simulate(yaw: number, pitch: number, wind: Wind, keep = 0) {
  const { across, along } = windParts(wind),
    path: FlightPoint[] = [],
    h = STEP;
  // Position (x across, y up, d downrange) and velocity.
  let x = 0,
    y = LAUNCH,
    d = 0,
    vx = SPEED * Math.cos(pitch) * Math.sin(yaw),
    vy = SPEED * Math.sin(pitch),
    vd = SPEED * Math.cos(pitch) * Math.cos(yaw),
    t = 0,
    n = 0;
  // The pull on the arrow at a velocity: drag through the moving air, and gravity (written into ax, ay, ad).
  let ax = 0,
    ay = 0,
    ad = 0;
  const pull = (ux: number, uy: number, ud: number) => {
    const rx = ux - across,
      rd = ud - along,
      k = DRAG * Math.sqrt(rx * rx + uy * uy + rd * rd);
    ax = -k * rx;
    ay = -k * uy - GRAVITY;
    ad = -k * rd;
  };
  if (keep) path.push({ x, y, d, t });
  while (d < DISTANCE && t < 6) {
    // Classic fourth-order Runge-Kutta on position and velocity.
    pull(vx, vy, vd);
    const a1x = ax, a1y = ay, a1d = ad,
      v2x = vx + (a1x * h) / 2, v2y = vy + (a1y * h) / 2, v2d = vd + (a1d * h) / 2;
    pull(v2x, v2y, v2d);
    const a2x = ax, a2y = ay, a2d = ad,
      v3x = vx + (a2x * h) / 2, v3y = vy + (a2y * h) / 2, v3d = vd + (a2d * h) / 2;
    pull(v3x, v3y, v3d);
    const a3x = ax, a3y = ay, a3d = ad,
      v4x = vx + a3x * h, v4y = vy + a3y * h, v4d = vd + a3d * h;
    pull(v4x, v4y, v4d);
    const nx = x + (h / 6) * (vx + 2 * v2x + 2 * v3x + v4x),
      ny = y + (h / 6) * (vy + 2 * v2y + 2 * v3y + v4y),
      nd = d + (h / 6) * (vd + 2 * v2d + 2 * v3d + v4d),
      nvx = vx + (h / 6) * (a1x + 2 * a2x + 2 * a3x + ax),
      nvy = vy + (h / 6) * (a1y + 2 * a2y + 2 * a3y + ay),
      nvd = vd + (h / 6) * (a1d + 2 * a2d + 2 * a3d + ad);
    if (nd >= DISTANCE) {
      // The crossing, between this step and the next (the way is all but straight over so short a stretch).
      const f = (DISTANCE - d) / (nd - d),
        cx = x + (nx - x) * f,
        cy = y + (ny - y) * f,
        ct = t + h * f;
      if (keep) path.push({ x: cx, y: cy, d: DISTANCE, t: ct });
      return { x: cx, y: cy - CENTRE, t: ct, speed: Math.hypot(vx + (nvx - vx) * f, vy + (nvy - vy) * f, vd + (nvd - vd) * f), path };
    }
    x = nx;
    y = ny;
    d = nd;
    vx = nvx;
    vy = nvy;
    vd = nvd;
    t += h;
    if (keep && ++n % keep === 0) path.push({ x, y, d, t });
  }
  return { x, y: y - CENTRE, t, speed: Math.hypot(vx, vy, vd), path };
}
const CALM: Wind = { speed: 0, dir: 0 };
let levelPitch: number | null = null;
/**
 * How the bow is pointed so that, in still air, the arrow lands on the point (mm) the sight pin is on: the sight is
 * set for the distance. Across it is exact at once (the arrow keeps to its upright plane); the elevation is found by
 * a few secant steps until the still-air landing is within a thousandth of a millimetre.
 */
export function launchFor(aimX: number, aimY: number) {
  const yaw = Math.atan2(aimX / 1000, DISTANCE),
    want = aimY / 1000,
    height = (p: number) => simulate(yaw, p, CALM).y - want;
  // The elevation for the middle, found once: a first guess allowing for the drop, then the same secant steps.
  if (levelPitch === null) {
    let a = Math.atan((CENTRE - LAUNCH + 7.5) / DISTANCE),
      b = a + 0.002,
      fa = simulate(0, a, CALM).y,
      fb = simulate(0, b, CALM).y;
    for (let k = 0; k < 12 && Math.abs(fb) > 1e-9; k++) {
      const c = b - (fb * (b - a)) / (fb - fa);
      a = b;
      fa = fb;
      b = c;
      fb = simulate(0, b, CALM).y;
    }
    levelPitch = b;
  }
  let a = levelPitch + Math.atan(want / DISTANCE),
    b = a + 0.0005,
    fa = height(a),
    fb = height(b);
  for (let k = 0; k < 12 && Math.abs(fb) > 1e-9; k++) {
    if (fb === fa) break;
    const c = b - (fb * (b - a)) / (fb - fa);
    a = b;
    fa = fb;
    b = c;
    fb = height(b);
  }
  return { yaw, pitch: b };
}
/**
 * The flight of an arrow aimed at (`aimX`, `aimY`) mm through `wind`: where it lands (mm from the face's middle, y
 * up), how long it flew (s), how fast it struck (m/s), and its way (points every `every` steps, when asked; the view
 * draws the flight from it).
 */
export function fly(aimX: number, aimY: number, wind: Wind, every = 0) {
  const { yaw, pitch } = launchFor(aimX, aimY),
    flight = simulate(yaw, pitch, wind, every);
  return { x: flight.x * 1000, y: flight.y * 1000, t: flight.t, speed: flight.speed, path: flight.path };
}
/** How far the wind carries an arrow aimed at the middle (mm across and up): what an archer allows for. */
export function drift(wind: Wind) {
  const f = fly(0, 0, wind);
  return { x: f.x, y: f.y };
}
/** What an arrow landing at (x, y) mm scores: an arrow touching a line counts for the zone inside it. */
export function scoreAt(x: number, y: number) {
  const r = Math.hypot(x, y),
    reach = r - SHAFT;
  if (reach > FACE) return { value: 0, inner: false, label: "M" };
  const zone = Math.max(1, Math.ceil(reach / ZONE - 1e-9)),
    value = 11 - zone,
    inner = reach <= X_RING;
  return { value, inner, label: inner ? "X" : String(value) };
}
/** The point aimed at as one number, and back: millimetres from the middle to a tenth, each within ±2 m. */
const REACH = 20000,
  SPAN = REACH * 2 + 1,
  tenths = (v: number) => Math.max(-REACH, Math.min(REACH, Math.round(v * 10))) + REACH;
export const aimCode = (x: number, y: number) => tenths(x) * SPAN + tenths(y);
export function aimOf(code: number) {
  if (!Number.isInteger(code) || code < 0 || code >= SPAN * SPAN) return null;
  return { x: (Math.floor(code / SPAN) - REACH) / 10, y: ((code % SPAN) - REACH) / 10 };
}
/** Who shoots the arrows of a set: one arrow each in turn, `first` leading. */
const setOrder = (first: 0 | 1, each: number): (0 | 1)[] => Array.from({ length: each * 2 }, (_, k) => (k % 2 ? other(first) : first));
export function createGame(format: Format = "match", random: Random = cryptoRandom): State {
  const alone = format !== "match",
    perEnd = alone ? END_ARROWS : SET_ARROWS,
    order: (0 | 1)[] = alone ? Array.from({ length: perEnd }, () => 0 as const) : setOrder(0, perEnd);
  return {
    format,
    perEnd,
    ends: format === "12" ? 2 : format === "36" ? 6 : 5,
    order,
    winds: drawWinds(order.length, random),
    arrows: [],
    history: [],
    shootOff: false,
    setPoints: [0, 0],
    totals: [0, 0],
    turn: order[0],
    last: null,
    closed: false,
    winner: null,
    ply: 0,
  };
}
/** A few shots that stand for all of them (any point may be aimed at): the middle and round it, as a person shoots. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  for (const [x, y] of [[0, 0], [ZONE, 0], [-ZONE, 0], [0, ZONE], [0, -ZONE]]) out.push({ from: -1, to: aimCode(x, y), extra: 0 });
  return out;
}
/** A point drawn round (x, y), `spread` millimetres wide one way (two draws from `random`). */
function scatter(x: number, y: number, spread: number, random: Random) {
  const u = Math.max(1e-12, random()),
    v = random(),
    r = Math.sqrt(-2 * Math.log(u)) * spread,
    a = v * Math.PI * 2;
  return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
}
/** The draws that lay an end's winds when `play` is given none: a fixed sequence from the count of arrows shot. */
function fallback(seed: number): Random {
  let s = (seed * 7919 + 17) % 2147483646 || 1;
  return () => ((s = (s * 48271) % 2147483647) - 1) / 2147483646;
}
const sum = (arrows: Arrow[], side: 0 | 1) => arrows.reduce((s, a) => (a.side === side ? s + a.value : s), 0);
/** How close to the middle a side's arrow came in a shoot-off (mm). */
const closest = (arrows: Arrow[], side: 0 | 1) => Math.min(...arrows.filter((a) => a.side === side).map((a) => a.r));
/**
 * A shot: where it lands is found here (round the point aimed at by the move's scatter, a person's landing on it,
 * then flown through this arrow's wind); its score, the end of the end, the set points and the match follow.
 */
export function play(state: State, move: Move, random?: Random): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  const aim = aimOf(move.to);
  if (!aim || !Number.isInteger(move.extra) || move.extra < 0 || move.extra > MAX_SPREAD) return null;
  const index = state.arrows.length,
    side = state.order[index],
    wind = state.winds[index];
  if (side === undefined || !wind) return null;
  const at = random && move.extra > 0 ? scatter(aim.x, aim.y, move.extra, random) : aim,
    flight = fly(at.x, at.y, wind),
    x = round1(flight.x),
    y = round1(flight.y),
    hit = scoreAt(x, y),
    arrow: Arrow = { side, aim, sent: { x: at.x, y: at.y }, x, y, r: round1(Math.hypot(x, y)), ...hit, boss: Math.abs(x) <= BOSS && Math.abs(y) <= BOSS, wind },
    arrows = [...state.arrows, arrow],
    totals: [number, number] = [...state.totals];
  totals[side] += arrow.value;
  const next: State = { ...state, arrows, totals, last: arrow, closed: false, ply: state.ply + 1 };
  if (arrows.length < state.order.length) return { ...next, turn: state.order[arrows.length] };
  // The end is shot: it is scored, and the next one begins with winds of its own.
  const draws = random ?? fallback(next.ply),
    ended = (points: [number, number], shootOff: boolean): End => ({ arrows, totals: [sum(arrows, 0), sum(arrows, 1)], points, shootOff }),
    begin = (order: (0 | 1)[], extra: Partial<State>): State => ({ ...next, ...extra, order, winds: drawWinds(order.length, draws), arrows: [], turn: order[0], closed: true });
  if (state.format !== "match") {
    const history = [...state.history, ended([0, 0], false)];
    if (history.length >= state.ends) return { ...next, history, arrows: [], closed: true, winner: 0 };
    return begin(state.order, { history });
  }
  if (state.shootOff) {
    const mine = closest(arrows, 0),
      theirs = closest(arrows, 1);
    // Exactly as close: another arrow each.
    if (mine === theirs) return begin(state.order, { history: [...state.history, ended([0, 0], true)] });
    const won: 0 | 1 = mine < theirs ? 0 : 1,
      points: [number, number] = won === 0 ? [1, 0] : [0, 1],
      setPoints: [number, number] = [state.setPoints[0] + points[0], state.setPoints[1] + points[1]];
    return { ...next, history: [...state.history, ended(points, true)], setPoints, arrows: [], closed: true, winner: won };
  }
  const a = sum(arrows, 0),
    b = sum(arrows, 1),
    points: [number, number] = a > b ? [2, 0] : a < b ? [0, 2] : [1, 1],
    setPoints: [number, number] = [state.setPoints[0] + points[0], state.setPoints[1] + points[1]],
    history = [...state.history, ended(points, false)];
  if (setPoints[0] >= WIN || setPoints[1] >= WIN) return { ...next, history, setPoints, arrows: [], closed: true, winner: setPoints[0] >= WIN ? 0 : 1 };
  // The one behind leads off the next set; level, the one who began the match. At 5–5, a single arrow each.
  const first: 0 | 1 = setPoints[0] === setPoints[1] ? 0 : setPoints[0] < setPoints[1] ? 0 : 1;
  if (setPoints[0] === WIN - 1 && setPoints[1] === WIN - 1) return begin([first, other(first)], { history, setPoints, shootOff: true });
  return begin(setOrder(first, SET_ARROWS), { history, setPoints });
}
/** A gaussian draw (two from `random`). */
const gauss = (random: Random) => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
/**
 * The computer's shot: it reads this arrow's wind (off by its level's share, in strength and a little in its way),
 * aims off the middle by the drift it expects, and shoots with its level's scatter.
 */
export function chooseShot(state: State, level: "easy" | "normal" | "hard", random: Random = cryptoRandom): Move | null {
  if (state.winner !== null) return null;
  const wind = state.winds[state.arrows.length];
  if (!wind) return null;
  const { spread, read } = LEVELS[level] ?? LEVELS.normal,
    seen: Wind = { speed: Math.max(0, wind.speed * (1 + gauss(random) * read)), dir: wind.dir + gauss(random) * read * 40 },
    off = drift(seen);
  return { from: -1, to: aimCode(-off.x, -off.y), extra: spread };
}
/** A side's arrows in the end under way, as labels. */
export const shotsOf = (state: State, side: 0 | 1) => state.arrows.filter((a) => a.side === side);
const effect = (): Effect | null => null;
export const archery: PointGame<State> = {
  create: (variant) => createGame(formatOf(variant)),
  moves,
  play,
  choose: (state, level, random) => chooseShot(state, level, random),
  turn: (state) => state.turn,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state, player) =>
    state.format === "match" ? (state.setPoints[player] - state.setPoints[other(player)]) * 20 + sum(state.arrows, player) - sum(state.arrows, other(player)) : state.totals[player],
  hint: (state) => {
    const wind = state.winds[state.arrows.length],
      blow = wind ? ` · 바람 ${wind.speed.toFixed(1)} m/s` : "",
      how = state.ply === 0 ? " · 화면을 누르고 있다가 떼면 쏩니다" : "";
    if (state.format !== "match") {
      const k = state.arrows.length + 1;
      return `${state.history.length + 1}/${state.ends}엔드 · ${k}/${state.perEnd}번째 화살${blow}${how}`;
    }
    if (state.shootOff) return `슛오프 · 한 발로 가립니다${blow}${how}`;
    const mine = shotsOf(state, state.turn).length + 1;
    return `${state.history.length + 1}세트 · ${mine}/${SET_ARROWS}번째 화살${blow}${how}`;
  },
  tally: (state) =>
    [0, 1].map((side) => {
      const own = shotsOf(state, side as 0 | 1),
        now = own.length ? ` · 이번 ${own.map((a) => a.label).join(" ")} (${own.reduce((s, a) => s + a.value, 0)})` : "";
      return state.format === "match" ? `세트 ${state.setPoints[side]}점${now}` : `합계 ${state.totals[side]}점${now}`;
    }) as [string, string],
  reason: (state) => {
    if (state.format !== "match") {
      const all = state.history.flatMap((end) => end.arrows),
        tens = all.filter((a) => a.value === 10).length,
        xs = all.filter((a) => a.inner).length;
      return `${all.length}발 합계 ${state.totals[0]}점입니다. 10점 ${tens}발, 그중 X ${xs}발.`;
    }
    const final = state.history[state.history.length - 1];
    if (final?.shootOff) {
      const mine = closest(final.arrows, 0),
        theirs = closest(final.arrows, 1);
      return `세트 점수 5 대 5에서 슛오프로 가렸습니다 (중심에서 ${mine.toFixed(1)}mm 대 ${theirs.toFixed(1)}mm).`;
    }
    return `세트 점수 ${state.setPoints[0]} 대 ${state.setPoints[1]}입니다 (화살 합계 ${state.totals[0]} 대 ${state.totals[1]}점).`;
  },
};
