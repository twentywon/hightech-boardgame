import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 마작 솔리테어 (MAHJONG SOLITAIRE): the old solitaire of matching mahjong tiles in pairs. Tiles are stacked in a
 * layout; one takes two free tiles that match and clears the board to win. Only the old game was taken: the layouts,
 * the look and the words are our own.
 *
 * Places. A layout is a list of slots. A slot is `{x, z, layer}` in half tiles: a tile covers `x … x+2` across and
 * `z … z+2` from far to near on its layer (0 the table), so that a tile may stand half a tile over from the ones
 * beside or under it. Slots are numbered by their place in the layout's list; that number is the "point" of a move.
 *
 * Free. A tile is free when no tile lies on it (on the next layer, overlapping it) and its left side or its right
 * side is open (no tile on its own layer touching that side, i.e. two half tiles away across and overlapping it from
 * far to near).
 *
 * Faces (0–41): 0–8 characters (萬) 1–9, 9–17 circles 1–9, 18–26 bamboo 1–9, 27–30 the winds 東 南 西 北, 31–33 the
 * dragons 中 發 and the white one, 34–37 the flowers (plum, orchid, chrysanthemum, bamboo) and 38–41 the seasons
 * (spring, summer, autumn, winter). Two tiles match when their faces are the same, or both are flowers, or both are
 * seasons (`groupOf`). A full set is 144 tiles: four of each of the 34 kinds and one of each flower and season.
 *
 * Moves through `play`:
 * - `{from: a, to: b}`: takes the two tiles of slots `a` and `b` off, when both are free, they differ and match.
 * - `{from: -1, to: SHUFFLE}` (다시 섞기): only when no pair is free and tiles are left (stuck). The tiles left stay
 *   where they lie but their faces are dealt again, so that the board can be cleared again (see below); refused when
 *   the places left cannot be cleared in any order of pairs (two tiles left one on the other).
 * - Anything else is refused (`refusal` says why; a tap on a tile that cannot be taken is sent as `{from: -1, to}`).
 * The board cleared is a win (`winner` 0). There is no failure: a board with no pair free is stuck, told by the
 * status line, and taken back with undo or dealt again with 다시 섞기.
 *
 * Deals. Every deal can be cleared: the full layout is taken apart in pairs of free places at random (`clearing`,
 * a randomised depth-first search that never hangs on a dead end), and the faces are laid on those pairs, each pair a
 * matching two; the order taken apart is a way through (`plan`), and the hint follows it while I do. A 다시 섞기 does
 * the same with the places left. When I take a pair the plan does not take, the plan is mended where it can be (the
 * partners of the two tiles taken become a pair), else a solver (`solve`, depth-first over the tiles left with the
 * safe pairs first, memory of dead boards and a budget) finds a new way; the hint is the first pair of the way.
 */
export const SHUFFLE = 1000;
export const FACES = 42;
export interface Slot {
  x: number;
  z: number;
  layer: number;
}
export type Last = { kind: "pair"; a: number; b: number } | { kind: "shuffle" } | null;
export interface State {
  stage: number;
  /** The places of the layout (the stage's own list, shared by every state of a game). */
  slots: readonly Slot[];
  /** The face of each slot (what a slot taken off showed is kept, unseen). */
  faces: number[];
  /** 1 where a tile still lies. */
  present: number[];
  /** A way to clear the board from here, slots in pairs, when one is known; empty when it is not. */
  plan: number[];
  last: Last;
  shuffles: number;
  winner: Winner;
  ply: number;
}

/** Which faces match: every kind to itself, the flowers to each other and the seasons to each other. */
export const groupOf = (face: number) => (face < 34 ? face : face < 38 ? 34 : 38);
export const matches = (a: number, b: number) => groupOf(a) === groupOf(b);
export const isFlower = (face: number) => face >= 34 && face < 38;
export const isSeason = (face: number) => face >= 38;

/** Tiles in rows of a picture: each `o` at column c and row r is a tile at (dx + 2c, dz + 2r) on `layer`. */
function rows(layer: number, picture: string[], dx = 0, dz = 0): Slot[] {
  const out: Slot[] = [];
  picture.forEach((row, r) => [...row].forEach((ch, c) => ch === "o" && out.push({ x: dx + 2 * c, z: dz + 2 * r, layer })));
  return out;
}
const block = (layer: number, cols: number, count: number, dx = 0, dz = 0) => rows(layer, Array(count).fill("o".repeat(cols)), dx, dz);

/** 작은 피라미드: three steps on a field of six by four, a tile at each end. 38 tiles. */
const PYRAMID: Slot[] = [...block(0, 6, 4), { x: -2, z: 3, layer: 0 }, { x: 12, z: 3, layer: 0 }, ...block(1, 4, 2, 2, 2), ...block(2, 2, 2, 4, 2)];
/** 요새: a wall two high round a yard, a tower on each corner and a keep in the middle. 72 tiles. */
const WALL = ["oooooooooo", "o........o", "o........o", "o........o", "o........o", "oooooooooo"];
const FORTRESS: Slot[] = [...rows(0, WALL), ...rows(1, WALL), ...rows(2, ["o........o", "", "", "", "", "o........o"]), ...block(0, 4, 2, 6, 4), ...block(1, 2, 2, 8, 4)];
/** 다리: a deck two tiles wide between two banks, two towers three high with a cap on each. 114 tiles. */
const BRIDGE: Slot[] = [
  ...rows(0, ["oo............oo", "ooooo......ooooo", "oooooooooooooooo", "oooooooooooooooo", "ooooo......ooooo", "oo............oo"]),
  ...rows(1, ["", "...oo......oo...", ".oooooooooooooo.", ".oooooooooooooo.", "...oo......oo..."]),
  ...rows(2, ["", "...oo......oo...", "...oo......oo...", "...oo......oo...", "...oo......oo..."]),
  { x: 7, z: 5, layer: 3 },
  { x: 23, z: 5, layer: 3 },
];
/**
 * 용: a dragon from above, our own: a head with horns at the upper left, a body of two broad bands joined at the right
 * in an S, a ridge on each band with spines on it, and a tail curling away at the lower left. 140 tiles.
 */
const DRAGON: Slot[] = [
  ...rows(0, [
    "oo..............",
    "oooo............",
    "ooooooooooooo...",
    ".ooooooooooooo..",
    "...........oooo.",
    "...oooooooooooo.",
    "..ooooooooooooo.",
    ".ooo............",
    "oo..............",
  ]),
  ...rows(1, ["", "ooo", ".oooooooooooo", ".oooooooooooo", "", "...ooooooooooo", "...ooooooooooo"]),
  ...rows(2, [".oooooooooo"], 2, 5),
  ...rows(2, ["ooooooooo"], 8, 11),
  ...[3, 6, 9].map((c) => ({ x: 2 * c, z: 5, layer: 3 })),
  ...[5, 8, 11].map((c) => ({ x: 2 * c, z: 11, layer: 3 })),
];
/** 거북 탑: the old turtle-like tower of five layers, 144 tiles (the whole set). */
const TURTLE: Slot[] = [
  ...rows(0, ["oooooooooooo", "..oooooooo", ".oooooooooo", "oooooooooooo", "oooooooooooo", ".oooooooooo", "..oooooooo", "oooooooooooo"]),
  { x: -2, z: 7, layer: 0 },
  { x: 24, z: 7, layer: 0 },
  { x: 26, z: 7, layer: 0 },
  ...block(1, 6, 6, 6, 2),
  ...block(2, 4, 4, 8, 4),
  ...block(3, 2, 2, 10, 6),
  { x: 11, z: 7, layer: 4 },
];
/** Lays a layout's slots so that its middle (across and from far to near) is at 0, 0. */
function centred(slots: Slot[]): Slot[] {
  const xs = slots.map((s) => s.x),
    zs = slots.map((s) => s.z),
    cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    cz = Math.round((Math.min(...zs) + Math.max(...zs)) / 2);
  // Far tiles first, then left to right, lower layers first: the order the keyboard and the tests count them in.
  return slots.map((s) => ({ x: s.x - cx, z: s.z - cz, layer: s.layer })).sort((a, b) => a.layer - b.layer || a.z - b.z || a.x - b.x);
}
export interface Stage {
  name: string;
  slots: Slot[];
}
export const STAGES: Stage[] = [
  { name: "작은 피라미드", slots: centred(PYRAMID) },
  { name: "요새", slots: centred(FORTRESS) },
  { name: "다리", slots: centred(BRIDGE) },
  { name: "용", slots: centred(DRAGON) },
  { name: "거북 탑", slots: centred(TURTLE) },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));

/** What touches each slot: the tiles on it, beside it on the left and on the right, and under it. */
export interface Touch {
  above: number[][];
  left: number[][];
  right: number[][];
  below: number[][];
  /** `over[i][j]` when the tile of slot j lies over that of slot i, on it or on what lies on it: j must go first. */
  over: boolean[][];
}
const touching = new WeakMap<readonly Slot[], Touch>();
export function touchOf(slots: readonly Slot[]): Touch {
  let t = touching.get(slots);
  if (t) return t;
  const n = slots.length;
  t = { above: [], left: [], right: [], below: [], over: [] };
  for (let i = 0; i < n; i++) {
    t.above.push([]);
    t.left.push([]);
    t.right.push([]);
    t.below.push([]);
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = slots[i],
        b = slots[j],
        dx = b.x - a.x,
        dz = Math.abs(b.z - a.z);
      if (b.layer === a.layer + 1 && Math.abs(dx) < 2 && dz < 2) t.above[i].push(j);
      if (b.layer === a.layer - 1 && Math.abs(dx) < 2 && dz < 2) t.below[i].push(j);
      if (b.layer === a.layer && dz < 2 && dx === -2) t.left[i].push(j);
      if (b.layer === a.layer && dz < 2 && dx === 2) t.right[i].push(j);
    }
  // Over: what lies on a tile, and over that, and so on (slots are listed lower layers first, so the upper are done first).
  t.over = slots.map(() => slots.map(() => false));
  const byLayer = slots.map((_, i) => i).sort((a, b) => slots[b].layer - slots[a].layer);
  for (const i of byLayer)
    for (const j of t.above[i]) {
      t.over[i][j] = true;
      for (let k = 0; k < n; k++) if (t.over[j][k]) t.over[i][k] = true;
    }
  touching.set(slots, t);
  return t;
}
const none = (list: number[], present: ArrayLike<number>) => list.every((j) => !present[j]);
/** Whether the tile of slot `i` may be taken: nothing on it, and its left or its right side open. */
export function freeIn(t: Touch, present: ArrayLike<number>, i: number) {
  return !!present[i] && none(t.above[i], present) && (none(t.left[i], present) || none(t.right[i], present));
}
export const isFree = (state: State, i: number) => freeIn(touchOf(state.slots), state.present, i);
export const freeTiles = (state: State) => state.present.flatMap((p, i) => (p && isFree(state, i) ? [i] : []));
export const tilesLeft = (state: Pick<State, "present">) => state.present.reduce((n, p) => n + p, 0);
/** Every pair of free tiles that match (each once, the lower slot first). */
export function freePairs(state: State): [number, number][] {
  const free = freeTiles(state),
    out: [number, number][] = [];
  for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) if (matches(state.faces[free[i]], state.faces[free[j]])) out.push([free[i], free[j]]);
  return out;
}
/** No pair is free and tiles are left: only undo or 다시 섞기 go on. */
export const stuck = (state: State) => state.winner === null && tilesLeft(state) > 0 && freePairs(state).length === 0;
/** The tiles of mine that can be chosen now: free and with a free tile to match. */
export function pickable(state: State) {
  const out = new Set<number>();
  for (const [a, b] of freePairs(state)) out.add(a).add(b);
  return out;
}

export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const pairs = freePairs(state);
  if (!pairs.length) return tilesLeft(state) ? [{ from: -1, to: SHUFFLE, extra: -1 }] : [];
  return pairs.flatMap(([a, b]) => [
    { from: a, to: b, extra: -1 },
    { from: b, to: a, extra: -1 },
  ]);
}

/** Runs a way of pairs on the tiles present; true when every pair is free and matching when its turn comes. */
export function runs(slots: readonly Slot[], faces: number[], present: ArrayLike<number>, plan: number[]) {
  const t = touchOf(slots),
    left = Array.from(present);
  for (let k = 0; k + 1 < plan.length; k += 2) {
    const a = plan[k],
      b = plan[k + 1];
    if (a === b || !freeIn(t, left, a) || !freeIn(t, left, b) || !matches(faces[a], faces[b])) return false;
    left[a] = left[b] = 0;
  }
  return left.every((p) => !p);
}
/**
 * The way through after I took `a` and `b`, from the way known before: a pair of the way is simply dropped (taking
 * tiles early only frees others); else the two tiles their partners were to go with are paired instead, at the
 * place of either pair, if that still runs.
 */
function mended(state: State, plan: number[], a: number, b: number, present: number[]) {
  if (!plan.length) return [];
  const ia = plan.indexOf(a),
    ib = plan.indexOf(b);
  if (ia < 0 || ib < 0) return [];
  const pa = ia >> 1,
    pb = ib >> 1;
  if (pa === pb) return [...plan.slice(0, 2 * pa), ...plan.slice(2 * pa + 2)];
  const partner = (i: number) => (i % 2 ? plan[i - 1] : plan[i + 1]),
    pair = [partner(ia), partner(ib)];
  for (const at of [Math.min(pa, pb), Math.max(pa, pb)]) {
    const next: number[] = [];
    for (let k = 0; k < plan.length / 2; k++) {
      if (k === at) next.push(...pair);
      else if (k !== pa && k !== pb) next.push(plan[2 * k], plan[2 * k + 1]);
    }
    if (runs(state.slots, state.faces, present, next)) return next;
  }
  return [];
}
/** Ways found by the solver for states whose own `plan` was lost, so that the next move can mend them. */
const found = new WeakMap<State, number[]>();
const planOf = (state: State) => (state.plan.length ? state.plan : (found.get(state) ?? []));

export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (state.winner !== null) return null;
  if (move.from === -1 && move.to === SHUFFLE) return stuck(state) ? reshuffle(state, random) : null;
  const { from: a, to: b } = move;
  const n = state.slots.length;
  if (a < 0 || b < 0 || a >= n || b >= n || a === b) return null;
  if (!isFree(state, a) || !isFree(state, b) || !matches(state.faces[a], state.faces[b])) return null;
  const present = [...state.present];
  present[a] = present[b] = 0;
  const left = tilesLeft({ present });
  return {
    ...state,
    present,
    plan: left ? mended(state, planOf(state), a, b, present) : [],
    last: { kind: "pair", a, b },
    winner: left ? null : 0,
    ply: state.ply + 1,
  };
}
/** Why a move of mine is refused (a tap on a tile that cannot be taken), or null. */
export function refusal(state: State, move: Move): string | null {
  if (state.winner !== null) return null;
  if (move.to === SHUFFLE) return stuck(state) ? "남은 패를 어떤 순서로도 모두 맞출 수 없게 쌓여 있어 섞을 수 없습니다. 무르기로 되돌려 보세요." : "아직 맞출 수 있는 짝이 있습니다.";
  const t = touchOf(state.slots),
    of = (i: number) => {
      if (i < 0 || i >= state.slots.length || !state.present[i]) return null;
      if (!none(t.above[i], state.present)) return "위에 다른 패가 놓여 있어 집을 수 없습니다.";
      if (!freeIn(t, state.present, i)) return "왼쪽과 오른쪽이 모두 막혀 있어 집을 수 없습니다. 한쪽 옆이 비어야 합니다.";
      return null;
    };
  const blocked = of(move.from) ?? of(move.to);
  if (blocked) return blocked;
  if (move.from === -1 && move.to >= 0 && move.to < state.slots.length && state.present[move.to]) return "이 패와 짝이 되는 패가 아직 모두 막혀 있습니다.";
  if (move.from >= 0 && move.to >= 0 && state.present[move.from] && state.present[move.to] && !matches(state.faces[move.from], state.faces[move.to]))
    return "짝이 아닙니다. 같은 그림끼리, 꽃은 꽃끼리, 계절은 계절끼리 맞춥니다.";
  return null;
}

/** A key for a set of tiles present, for remembering boards already found to be dead ends. */
function keyOf(present: ArrayLike<number>) {
  let key = "",
    word = 0,
    bits = 0;
  for (let i = 0; i < present.length; i++) {
    word = (word << 1) | (present[i] ? 1 : 0);
    if (++bits === 15) {
      key += String.fromCharCode(word + 48);
      word = bits = 0;
    }
  }
  return key + String.fromCharCode(word + 48);
}
const shuffled = <X>(list: X[], random: Random) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};
/**
 * An order in which the tiles present can be taken off in pairs of free places, whatever their faces: a depth-first
 * search that chooses at random, tries a few pairs at each step and remembers boards that came to a dead end; null
 * when there is none (or `budget` steps were not enough).
 */
export function clearing(slots: readonly Slot[], present: ArrayLike<number>, random: Random, budget = 20000): number[] | null {
  const t = touchOf(slots),
    left: number[] = Array.from(present, (p) => (p ? 1 : 0)),
    order: number[] = [],
    dead = new Set<string>();
  let count = left.reduce((n, p) => n + p, 0),
    steps = 0;
  if (count % 2) return null;
  const go = (): boolean => {
    if (!count) return true;
    if (++steps > budget) return false;
    const key = keyOf(left);
    if (dead.has(key)) return false;
    const free = shuffled(
      left.flatMap((p, i) => (p && freeIn(t, left, i) ? [i] : [])),
      random,
    );
    let tries = 0;
    for (let i = 0; i < free.length && tries < 8; i++)
      for (let j = i + 1; j < free.length && tries < 8; j++, tries++) {
        const a = free[i],
          b = free[j];
        left[a] = left[b] = 0;
        count -= 2;
        order.push(a, b);
        if (go()) return true;
        order.length -= 2;
        left[a] = left[b] = 1;
        count += 2;
        if (steps > budget) return false;
      }
    dead.add(key);
    return false;
  };
  return go() ? order : null;
}
/** The faces of a deal of `count` tiles, as matching pairs: whole sets of four of kinds drawn at random (the flowers and the seasons count as a kind each), and one pair more when the count asks for it. */
function dealFaces(count: number, random: Random): [number, number][] {
  const kinds = shuffled(
      Array.from({ length: 36 }, (_, k) => k),
      random,
    ),
    pairs: [number, number][] = [];
  const four = (kind: number): number[] => (kind < 34 ? [kind, kind, kind, kind] : shuffled(kind === 34 ? [34, 35, 36, 37] : [38, 39, 40, 41], random));
  for (const kind of kinds.slice(0, Math.floor(count / 4))) {
    const f = four(kind);
    pairs.push([f[0], f[1]], [f[2], f[3]]);
  }
  if (count % 4) {
    const f = four(kinds[Math.floor(count / 4)]);
    pairs.push([f[0], f[1]]);
  }
  return shuffled(pairs, random);
}
/** Lays faces on the slots of an order of pairs. */
function lay(faces: number[], order: number[], pairs: [number, number][]) {
  for (let k = 0; k < pairs.length; k++) {
    faces[order[2 * k]] = pairs[k][0];
    faces[order[2 * k + 1]] = pairs[k][1];
  }
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
/** A new deal of `stage` (1–5), its way through kept as `plan`. One number is drawn from `random`. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage),
    slots = STAGES[at - 1].slots,
    quickly = quick(Math.floor(random() * 4294967296)),
    all = slots.map(() => 1);
  let order: number[] | null = null;
  for (let k = 0; k < 50 && !order; k++) order = clearing(slots, all, quickly);
  if (!order) throw new Error("a layout that cannot be cleared");
  const faces = slots.map(() => 0);
  lay(faces, order, dealFaces(slots.length, quickly));
  return { stage: at, slots, faces, present: all, plan: order, last: null, shuffles: 0, winner: null, ply: 0 };
}
/** 다시 섞기: the faces left dealt again on the places left, so that they can be cleared; null when the places cannot be. */
export function reshuffle(state: State, random: Random = cryptoRandom): State | null {
  const quickly = quick(Math.floor(random() * 4294967296));
  let order: number[] | null = null;
  for (let k = 0; k < 20 && !order; k++) order = clearing(state.slots, state.present, quickly);
  if (!order) return null;
  // The faces left, paired within their groups (each group has an even number left, as tiles go in matching pairs).
  const groups = new Map<number, number[]>();
  state.present.forEach((p, i) => {
    if (!p) return;
    const g = groupOf(state.faces[i]);
    groups.set(g, [...(groups.get(g) ?? []), state.faces[i]]);
  });
  const pairs: [number, number][] = [];
  for (const list of groups.values()) {
    shuffled(list, quickly);
    for (let k = 0; k + 1 < list.length; k += 2) pairs.push([list[k], list[k + 1]]);
  }
  const faces = [...state.faces];
  lay(faces, order, shuffled(pairs, quickly));
  return { ...state, faces, plan: order, last: { kind: "shuffle" }, shuffles: state.shuffles + 1, ply: state.ply + 1 };
}

/**
 * Whether the tiles left of one group can still be paired at all: two tiles of which one lies over the other can
 * never be free together, so a group whose tiles cannot be split into pairs of tiles not over one another is dead.
 */
function pairable(t: Touch, tiles: number[]): boolean {
  if (tiles.length < 2) return !tiles.length;
  const [a, ...rest] = tiles;
  for (let k = 0; k < rest.length; k++) {
    const b = rest[k];
    if (t.over[a][b] || t.over[b][a]) continue;
    if (pairable(t, rest.filter((_, m) => m !== k))) return true;
  }
  return false;
}
/**
 * A way to clear the board from `state` (slots in pairs), or null when there is none or none was found within
 * `budget` boards. Depth first over the tiles left: when every tile left of a group is free its pairs are safe and
 * taken without trying others; otherwise the pairs are tried in the order of the way known before (`guide`), then
 * those that uncover the most first; boards found to be dead ends are remembered.
 */
export function solve(state: State, budget = 60000, guide: number[] = planOf(state)): number[] | null {
  if (state.winner === 0) return [];
  const t = touchOf(state.slots),
    faces = state.faces,
    left = Array.from(state.present),
    remaining = new Map<number, number>(),
    rank = new Map<number, number>(),
    order: number[] = [],
    dead = new Set<string>();
  guide.forEach((slot, k) => rank.set(slot, k));
  left.forEach((p, i) => p && remaining.set(groupOf(faces[i]), (remaining.get(groupOf(faces[i])) ?? 0) + 1));
  let count = left.reduce((n, p) => n + p, 0),
    steps = 0;
  // How much taking a tile uncovers: the tiles under it and beside it.
  // How much taking a tile opens up: every tile it lies over (twice), and the tiles of its row on its closed side.
  const run = (i: number, side: number[][]) => {
    let n = 0;
    for (let at = side[i].find((j) => left[j]); at !== undefined; at = side[at].find((j) => left[j])) n++;
    return n;
  };
  const worth = (i: number) => {
    let under = 0;
    for (let j = 0; j < left.length; j++) if (left[j] && t.over[j][i]) under++;
    return 2 * under + Math.max(run(i, t.left), run(i, t.right)) * 0.5 + state.slots[i].layer;
  };
  const take = (a: number, b: number) => {
    left[a] = left[b] = 0;
    count -= 2;
    const g = groupOf(faces[a]);
    remaining.set(g, remaining.get(g)! - 2);
    order.push(a, b);
  };
  const put = (a: number, b: number) => {
    left[a] = left[b] = 1;
    count += 2;
    const g = groupOf(faces[a]);
    remaining.set(g, remaining.get(g)! + 2);
    order.length -= 2;
  };
  const go = (): boolean => {
    if (!count) return true;
    if (++steps > budget) return false;
    const key = keyOf(left);
    if (dead.has(key)) return false;
    // A group that can no longer be paired makes the board a dead end.
    const members = new Map<number, number[]>();
    for (let i = 0; i < left.length; i++)
      if (left[i]) {
        const g = groupOf(faces[i]);
        members.set(g, [...(members.get(g) ?? []), i]);
      }
    for (const tiles of members.values())
      if (!pairable(t, tiles)) {
        dead.add(key);
        return false;
      }
    const byGroup = new Map<number, number[]>();
    for (let i = 0; i < left.length; i++)
      if (left[i] && freeIn(t, left, i)) {
        const g = groupOf(faces[i]);
        byGroup.set(g, [...(byGroup.get(g) ?? []), i]);
      }
    const options: [number, number][] = [];
    for (const [g, free] of byGroup) {
      if (free.length < 2) continue;
      if (free.length === remaining.get(g)) {
        // Every tile left of this group is free: taking two of them can never hurt.
        take(free[0], free[1]);
        if (go()) return true;
        put(free[0], free[1]);
        if (steps <= budget) dead.add(key);
        return false;
      }
      for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) options.push([free[i], free[j]]);
    }
    // The pairs of the way known before first, in its order; then those that open up the most.
    const score = ([a, b]: [number, number]) => (rank.has(a) && rank.has(b) ? Math.max(rank.get(a)!, rank.get(b)!) - 1e6 : -worth(a) - worth(b));
    options.sort((p, q) => score(p) - score(q));
    for (const [a, b] of options) {
      take(a, b);
      if (go()) return true;
      put(a, b);
      if (steps > budget) return false;
    }
    dead.add(key);
    return false;
  };
  const solved = go();
  lastSearch.sure = solved || steps <= budget;
  return solved ? [...order] : null;
}
/** Whether the last `solve` that found nothing searched every board (so that there is no way), or ran out of budget. */
export const lastSearch = { sure: true };
/**
 * When the solver ran out of budget before finding a way: a free pair whose taking leaves every group still able to
 * be paired, the one that opens up the most.
 */
function likelyPair(state: State): [number, number] | null {
  const t = touchOf(state.slots);
  let best: [number, number] | null = null,
    most = -Infinity;
  for (const [a, b] of freePairs(state)) {
    const present = [...state.present];
    present[a] = present[b] = 0;
    const groups = new Map<number, number[]>();
    present.forEach((p, i) => p && groups.set(groupOf(state.faces[i]), [...(groups.get(groupOf(state.faces[i])) ?? []), i]));
    if (![...groups.values()].every((tiles) => pairable(t, tiles))) continue;
    const opened = freeTiles({ ...state, present }).length;
    if (opened > most) {
      most = opened;
      best = [a, b];
    }
  }
  return best;
}
/** A known way through from `state`: its own plan when that still runs, else what the solver finds (remembered). */
export function wayFrom(state: State): number[] | null {
  if (state.winner === 0) return [];
  const own = planOf(state);
  if (own.length && runs(state.slots, state.faces, state.present, own)) return own;
  const way = solve(state);
  if (way) found.set(state, way);
  return way;
}
/** The hint: 다시 섞기 when stuck, else the first pair of a way through; null when the board cannot be cleared from here. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  if (stuck(state)) return { from: -1, to: SHUFFLE, extra: -1 };
  const way = wayFrom(state);
  if (way && way.length) return { from: way[0], to: way[1], extra: -1 };
  // Not found within the budget, though there may be a way: a pair that does not plainly spoil the board.
  const likely = !way && !lastSearch.sure ? likelyPair(state) : null;
  return likely ? { from: likely[0], to: likely[1], extra: -1 } : null;
}

const effect = (s: State): Effect | null =>
  s.last?.kind === "pair" ? { kind: "move", from: s.last.a, to: s.last.b, converted: [], removed: [s.last.a, s.last.b] } : null;
export const mahjong: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move, random) => play(state, move, random),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.slots.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -tilesLeft(s),
  hint: (s) => (stuck(s) ? "맞출 수 있는 짝이 없습니다 · 다시 섞기나 무르기를 누르세요" : `짝이 맞는 자유로운 패 두 개를 고르세요 · 남은 패 ${tilesLeft(s)}개`),
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 패를 모두 맞춰 판을 비웠습니다." : ""),
};
