import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Darts on a standard board: twenty numbered segments in the classic order round a bull, each with a thin double
 * ring at the edge and a treble ring half way in. A throw is a move whose `to` is the point aimed at (millimetres
 * from the bull, to a tenth, `aimCode`) and whose `extra` is how widely the dart scatters round it (one standard
 * deviation, in millimetres). A person's throw scatters not at all (0): a person's unsteady hand is the aiming ring
 * trembling while they aim (`tremor` in layout.ts), and the throw names the point where the ring's dot was when
 * they let go, so the dart lands on that dot. The computer's throws carry its level's scatter, drawn in `play` from
 * the `random` passed in. Either way where a dart lands, and what it scores, is decided in `play` and can be
 * replayed; without `random` a dart lands where it was aimed.
 *
 * Two games: 501, double out (each side counts down from 501; the last dart must be a double or the bull; a visit
 * that would leave less than nothing, exactly one, or nothing without a double is a bust and counts nothing), and
 * count-up (eight rounds of three darts, the higher total wins). A visit is three darts; then the turn passes.
 */
export type Mode = "501" | "countup";
/** Count-up, the easier, comes first and is the one played unless 501 is chosen. */
export const MODES: { value: Mode; label: string }[] = [
  { value: "countup", label: "카운트업" },
  { value: "501", label: "501" },
];
export const modeOf = (variant: string): Mode => (variant === "501" ? "501" : "countup");
/** The radii of the rings, in millimetres from the centre: the bull, the outer bull, the treble and double rings, and the board's edge. */
export const BULL = 6.35,
  OUTER_BULL = 15.9,
  TREBLE_IN = 99,
  TREBLE_OUT = 107,
  DOUBLE_IN = 162,
  DOUBLE_OUT = 170,
  BOARD_EDGE = 225,
  /** Half the side of the cabinet's back; a dart beyond it glances off and falls. */
  CABINET = 330;
/** The numbers of the segments, clockwise from the top. */
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/** Darts in a visit, rounds of count-up, and the visits of 501 after which the side with less left wins (a game must end). */
export const DARTS = 3,
  ROUNDS = 8,
  START = 501,
  LIMIT = 30;
/** The widest scatter a move may name (a person's throws name none). */
export const MAX_SPREAD = 80;
/** The computer's levels: how widely its darts scatter round the point it aims at. */
export const LEVELS: Record<"easy" | "normal" | "hard", { label: string; spread: number }> = {
  easy: { label: "쉬움", spread: 40 },
  normal: { label: "보통", spread: 24 },
  hard: { label: "어려움", spread: 14 },
};
export type Ring = "miss" | "single" | "double" | "treble" | "outer" | "bull";
export interface Dart {
  /** Where it landed, in millimetres from the bull (y up). */
  x: number;
  y: number;
  ring: Ring;
  /** The segment's number (25 for the bulls, 0 for a miss). */
  number: number;
  points: number;
  /** Whether it counts as a double (a double, or the bull). */
  double: boolean;
  /** Short name: T20, D16, 5, 25, BULL, MISS. */
  label: string;
  /** Beyond the cabinet: it glanced off and fell. */
  fell: boolean;
}
export interface Visit {
  darts: Dart[];
  /** What it scored (0 for a bust). */
  total: number;
  bust: boolean;
  /** The side's score after it: points left in 501, the running total in count-up. */
  after: number;
}
export interface State {
  mode: Mode;
  /** 501: points left; count-up: the total scored. */
  scores: [number, number];
  turn: 0 | 1;
  /** The darts of the visit under way. */
  darts: Dart[];
  /** In 501, what the side to move had left when the visit began (a bust goes back to it). */
  start: number;
  /** Each side's finished visits, oldest first. */
  visits: [Visit[], Visit[]];
  /** The dart thrown last, and whether it ended a visit (the turn passed, or the game ended). */
  last: Dart | null;
  ended: boolean;
  bust: boolean;
  /** Who threw the dart thrown last. */
  thrower: 0 | 1;
  winner: Winner;
  ply: number;
}
/** The segment a point lies in, as its number. */
export function segmentAt(x: number, y: number) {
  const angle = (Math.atan2(x, y) * 180) / Math.PI,
    index = Math.floor((((angle + 9) % 360) + 360) % 360 / 18);
  return ORDER[index % 20];
}
/** What a dart landing at (x, y) scores. */
export function hitAt(x: number, y: number): Dart {
  const r = Math.hypot(x, y),
    fell = Math.abs(x) > CABINET || Math.abs(y) > CABINET,
    dart = (ring: Ring, number: number, points: number, double: boolean, label: string): Dart => ({ x, y, ring, number, points, double, label, fell });
  if (r <= BULL) return dart("bull", 25, 50, true, "BULL");
  if (r <= OUTER_BULL) return dart("outer", 25, 25, false, "25");
  if (r > DOUBLE_OUT) return dart("miss", 0, 0, false, "MISS");
  const n = segmentAt(x, y);
  if (r >= DOUBLE_IN) return dart("double", n, n * 2, true, `D${n}`);
  if (r >= TREBLE_IN && r <= TREBLE_OUT) return dart("treble", n, n * 3, false, `T${n}`);
  return dart("single", n, n, false, String(n));
}
/**
 * The point aimed at as one number, and back: millimetres from the centre to a tenth (as finely as a dart's landing
 * is kept, so that a steady throw lands exactly where it was aimed), each within ±400 mm.
 */
const REACH = 4000,
  SPAN = REACH * 2 + 1,
  tenths = (v: number) => Math.max(-REACH, Math.min(REACH, Math.round(v * 10))) + REACH;
export const aimCode = (x: number, y: number) => tenths(x) * SPAN + tenths(y);
export function aimOf(code: number) {
  if (!Number.isInteger(code) || code < 0 || code >= SPAN * SPAN) return null;
  return { x: (Math.floor(code / SPAN) - REACH) / 10, y: ((code % SPAN) - REACH) / 10 };
}
/** A target the computer aims at: a bed of the board, by its name, value and middle. */
export interface Target {
  name: string;
  points: number;
  double: boolean;
  x: number;
  y: number;
}
const centre = (n: number, radius: number) => {
  const a = ((ORDER.indexOf(n) * 18) * Math.PI) / 180;
  return { x: Math.sin(a) * radius, y: Math.cos(a) * radius };
};
/** Every bed: the singles (aimed at their outer part, the larger), doubles, trebles, the outer bull and the bull. */
export const TARGETS: Target[] = [
  ...ORDER.map((n) => ({ name: String(n), points: n, double: false, ...centre(n, (TREBLE_OUT + DOUBLE_IN) / 2) })),
  ...ORDER.map((n) => ({ name: `D${n}`, points: n * 2, double: true, ...centre(n, (DOUBLE_IN + DOUBLE_OUT) / 2) })),
  ...ORDER.map((n) => ({ name: `T${n}`, points: n * 3, double: false, ...centre(n, (TREBLE_IN + TREBLE_OUT) / 2) })),
  { name: "25", points: 25, double: false, x: 0, y: (BULL + OUTER_BULL) / 2 },
  { name: "BULL", points: 50, double: true, x: 0, y: 0 },
];
export const target = (name: string) => TARGETS.find((t) => t.name === name)!;
/** How much a finishing double is liked (lower is better): those that leave doubles when missed into the single first. */
const FINISH: Record<string, number> = { D20: 0, D16: 0, D8: 1, D10: 1, D12: 2, D18: 2, D4: 3, D6: 3, D14: 3, D2: 4, BULL: 6, D1: 9 };
/** How hard a dart that sets up a finish is: a single is easy, a treble of the top of the board is the usual, the bulls and doubles are avoided. */
function setupCost(t: Target) {
  if (t.name === "BULL") return 14;
  if (t.name === "25") return 12;
  if (t.double) return 15;
  if (t.name.startsWith("T")) return ["T20", "T19", "T18", "T17"].includes(t.name) ? 6 : 8;
  return 1;
}
let checkoutTable: (Target[] | null)[][] | null = null;
/**
 * The checkout table: for each count of darts in hand (1 to 3) and each score (2 to 170), the best way out, its
 * setting-up darts first (the higher first), ending on a double or the bull; null where there is none.
 */
export function checkouts() {
  if (checkoutTable) return checkoutTable;
  const table: (Target[] | null)[][] = [[], [], [], []],
    cost: number[][] = [[], [], [], []],
    finishes = TARGETS.filter((t) => t.double),
    offer = (darts: number, route: Target[]) => {
      const total = route.reduce((s, t) => s + t.points, 0),
        last = route[route.length - 1],
        price = route.length * 100 + (FINISH[last.name] ?? 5) + route.slice(0, -1).reduce((s, t) => s + setupCost(t), 0);
      if (total > 170) return;
      for (let d = darts; d <= 3; d++)
        if (cost[d][total] === undefined || price < cost[d][total]) {
          cost[d][total] = price;
          table[d][total] = route;
        }
    };
  for (const f of finishes) offer(1, [f]);
  for (const a of TARGETS) for (const f of finishes) offer(2, [a, f]);
  for (const a of TARGETS)
    for (const b of TARGETS) {
      if (b.points > a.points) continue;
      for (const f of finishes) offer(3, [a, b, f]);
    }
  for (let d = 1; d <= 3; d++) for (let s = 0; s <= 170; s++) table[d][s] ??= null;
  checkoutTable = table;
  return table;
}
/** The way out from `left` with `darts` in hand, or null. */
export const checkout = (left: number, darts: number) => (left >= 2 && left <= 170 && darts >= 1 && darts <= 3 ? checkouts()[darts][left] : null);
export function createGame(mode: Mode = "501"): State {
  const begin = mode === "501" ? START : 0;
  return { mode, scores: [begin, begin], turn: 0, darts: [], start: begin, visits: [[], []], last: null, ended: false, bust: false, thrower: 0, winner: null, ply: 0 };
}
/** A few throws that stand for all of them (any point may be aimed at): one at each bed, as a person throws (no scatter). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return TARGETS.map((t) => ({ from: -1, to: aimCode(t.x, t.y), extra: 0 }));
}
/** A point drawn round `aim`, `spread` millimetres wide one way (two draws from `random`). */
function scatter(x: number, y: number, spread: number, random: Random) {
  const u = Math.max(1e-9, random()),
    v = random(),
    r = Math.sqrt(-2 * Math.log(u)) * spread,
    a = v * Math.PI * 2;
  return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
}
const other = (side: 0 | 1): 0 | 1 => (side ? 0 : 1);
/**
 * A throw: where it lands is drawn here (round the point aimed at by the move's scatter; a throw with none, a
 * person's, lands on that point and draws nothing); the scores, a bust, the end of the visit and of the game follow.
 */
export function play(state: State, move: Move, random?: Random): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  const aim = aimOf(move.to);
  if (!aim || !Number.isInteger(move.extra) || move.extra < 0 || move.extra > MAX_SPREAD) return null;
  const at = random && move.extra > 0 ? scatter(aim.x, aim.y, move.extra, random) : aim,
    hit = hitAt(Math.round(at.x * 10) / 10, Math.round(at.y * 10) / 10),
    dart: Dart = hit.fell ? { ...hit, ring: "miss", number: 0, points: 0, double: false, label: "MISS" } : hit,
    side = state.turn,
    darts = [...state.darts, dart],
    scores: [number, number] = [...state.scores],
    visits: [Visit[], Visit[]] = [[...state.visits[0]], [...state.visits[1]]],
    next = { ...state, darts, last: dart, ended: false, bust: false, thrower: side, ply: state.ply + 1 };
  const close = (bust: boolean): State => {
    visits[side].push({ darts, total: bust ? 0 : darts.reduce((s, d) => s + d.points, 0), bust, after: scores[side] });
    const done = next.mode === "countup" ? visits[0].length >= ROUNDS && visits[1].length >= ROUNDS : visits[0].length >= LIMIT && visits[1].length >= LIMIT;
    const turn = other(side);
    return {
      ...next,
      scores,
      visits,
      darts: [],
      turn,
      start: scores[turn],
      ended: true,
      bust,
      winner: done ? (scores[0] === scores[1] ? "draw" : next.mode === "countup" ? (scores[0] > scores[1] ? 0 : 1) : scores[0] < scores[1] ? 0 : 1) : null,
    };
  };
  if (state.mode === "countup") {
    scores[side] += dart.points;
    return darts.length >= DARTS ? close(false) : { ...next, scores };
  }
  const left = state.scores[side] - dart.points;
  if (left < 0 || left === 1 || (left === 0 && !dart.double)) {
    // A bust: the visit counts nothing, and the turn passes at once.
    scores[side] = state.start;
    return close(true);
  }
  scores[side] = left;
  if (left === 0) {
    visits[side].push({ darts, total: darts.reduce((s, d) => s + d.points, 0), bust: false, after: 0 });
    return { ...next, scores, visits, ended: true, winner: side };
  }
  return darts.length >= DARTS ? close(false) : { ...next, scores };
}
/** The bed the computer goes for: the treble twenty to score, a way out from the checkout table, or a single that leaves a double. */
export function aimFor(state: State): Target {
  if (state.mode === "countup") return target("T20");
  const left = state.scores[state.turn],
    inHand = DARTS - state.darts.length,
    route = checkout(left, inHand);
  if (route) return route[0];
  // No way out with the darts in hand: the first dart of a longer way, so that the next visit can finish.
  for (let d = inHand + 1; d <= 3; d++) {
    const longer = checkout(left, d);
    if (longer && left - longer[0].points >= 2) return longer[0];
  }
  // Too far to finish: score, keeping clear of a bust.
  for (const name of ["T20", "T19", "T18", "20", "19"]) if (left - target(name).points >= 2) return target(name);
  for (let n = 20; n >= 1; n--) if (left - n >= 2) return target(String(n));
  return target("D1");
}
/** The computer's throw: the bed it goes for, with its level's scatter. */
export function chooseThrow(state: State, level: "easy" | "normal" | "hard"): Move | null {
  if (state.winner !== null) return null;
  const t = aimFor(state);
  return { from: -1, to: aimCode(t.x, t.y), extra: LEVELS[level]?.spread ?? LEVELS.normal.spread };
}
/** The checkout to suggest for the side to move in 501, as names (T20 T20 D20), or null. */
export function suggestion(state: State) {
  if (state.mode !== "501" || state.winner !== null) return null;
  const route = checkout(state.scores[state.turn], DARTS - state.darts.length);
  return route ? route.map((t) => t.name).join(" ") : null;
}
/** The round under way (1 to 8 in count-up). */
export const roundOf = (state: State) => Math.min(state.visits[state.turn].length + 1, state.mode === "countup" ? ROUNDS : LIMIT);
const effect = (): Effect | null => null;
const visitSum = (state: State) => state.darts.reduce((s, d) => s + d.points, 0);
export const darts: PointGame<State> = {
  create: (variant) => createGame(modeOf(variant)),
  moves,
  play,
  choose: (state, level) => chooseThrow(state, level),
  turn: (state) => state.turn,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state, player) => (state.mode === "501" ? state.scores[player ? 0 : 1] - state.scores[player] : state.scores[player] - state.scores[player ? 0 : 1]),
  hint: (state) => {
    const nth = `${state.darts.length + 1}번째 다트`,
      tip = suggestion(state);
    // The very first throw also says how to throw.
    const how = state.ply === 0 ? " · 화면을 위로 밀어 던지세요" : "";
    return state.mode === "countup" ? `${roundOf(state)}/${ROUNDS}라운드 · ${nth}${how}` : `남은 ${state.scores[state.turn]}점 · ${nth}${tip ? ` · 체크아웃 ${tip}` : how}`;
  },
  tally: (state) =>
    [0, 1].map((side) => {
      const mine = side === state.turn && state.winner === null && state.darts.length ? ` · 이번 ${state.darts.map((d) => d.label).join(" ")} (${visitSum(state)})` : "";
      return state.mode === "501" ? `남은 ${state.scores[side]}점${mine}` : `합계 ${state.scores[side]}점${mine}`;
    }) as [string, string],
  reason: (state) => {
    if (state.mode === "countup") return state.winner === "draw" ? `${ROUNDS}라운드 합계가 ${state.scores[0]}점으로 같습니다.` : `${ROUNDS}라운드 합계 ${state.scores[0]} 대 ${state.scores[1]}점입니다.`;
    const finished = state.scores[0] === 0 || state.scores[1] === 0;
    if (finished) return `${state.last?.label ?? "더블"}로 남은 점수를 0으로 만들어 끝냈습니다.`;
    return state.winner === "draw" ? `${LIMIT}라운드가 지나도록 아무도 끝내지 못했고, 남은 점수가 ${state.scores[0]}점으로 같습니다.` : `${LIMIT}라운드가 지나도록 아무도 끝내지 못해 남은 점수가 적은 쪽이 이겼습니다 (${state.scores[0]} 대 ${state.scores[1]}).`;
  },
};
