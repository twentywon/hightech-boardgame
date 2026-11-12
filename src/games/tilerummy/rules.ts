import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Tile rummy: 104 numbered tiles (1–13 in four colours, twice) and two
 * jokers. Each side holds a rack of fourteen. A turn lays tiles from the
 * rack on the table in sets — three or four of one number in different
 * colours, or three or more running numbers of one colour — and may take
 * the sets on the table apart and build them anew, so long as every set is
 * good when the turn ends. A side's first sets must be worth thirty of its
 * own tiles. Who cannot or will not lay draws a tile. First to empty the
 * rack wins.
 */
export const TILE_COUNT = 106,
  JOKER = 104,
  RACK_SIZE = 14,
  OPENING = 30,
  /** Points after the tiles: the sets of the table, a new set, back to the rack, and the three tools. */
  SET_BASE = 200,
  NEW_SET = 400,
  TO_RACK = 401,
  END = 402,
  DRAW = 403,
  RESET = 404,
  /** The computer lays a whole set from its rack in one move. */
  MELD_BASE = 500;
export const isJoker = (tile: number) => tile >= JOKER;
export const colourOf = (tile: number) => Math.floor(tile / 26);
export const numberOf = (tile: number) => (tile % 13) + 1;
export interface State {
  racks: [number[], number[]];
  pool: number[];
  table: number[][];
  /** The table and the mover's rack as the turn began: what a reset returns to, and what the turn is judged against. */
  before: { table: number[][]; rack: number[] };
  opened: [boolean, boolean];
  turn: 0 | 1;
  winner: Winner;
  /** Turns in a row in which nothing was laid and nothing could be drawn. */
  idle: number;
  ply: number;
  last: number | null;
}
export function createGame(random: Random = cryptoRandom): State {
  const pool = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const racks: [number[], number[]] = [pool.splice(0, RACK_SIZE), pool.splice(0, RACK_SIZE)];
  return { racks, pool, table: [], before: { table: [], rack: racks[0].slice() }, opened: [false, false], turn: 0, winner: null, idle: 0, ply: 0, last: null };
}
/** What a set is worth, or 0 when the tiles do not make a set. A joker counts as the tile it stands for. */
export function worth(tiles: number[]) {
  const n = tiles.length,
    plain = tiles.filter((t) => !isJoker(t)),
    jokers = n - plain.length;
  if (n < 3) return 0;
  if (!plain.length) return n <= 13 ? ((13 + 13 - n + 1) * n) / 2 : 0;
  const numbers = plain.map(numberOf),
    colours = plain.map(colourOf);
  // The same number in different colours.
  if (n <= 4 && numbers.every((x) => x === numbers[0]) && new Set(colours).size === plain.length) return numbers[0] * n;
  // Running numbers of one colour; jokers fill the gaps and lengthen the run upward where they can.
  if (n > 13 || !colours.every((c) => c === colours[0]) || new Set(numbers).size !== plain.length) return 0;
  const low = Math.min(...numbers),
    high = Math.max(...numbers);
  if (high - low + 1 - plain.length > jokers) return 0;
  const start = Math.min(low, 14 - n);
  if (start < 1 || start + n - 1 < high) return 0;
  return ((start + start + n - 1) * n) / 2;
}
export const valid = (tiles: number[]) => worth(tiles) > 0;
const without = (list: number[], tile: number) => list.filter((t) => t !== tile);
/** Tiles of the mover's rack as the turn began that now lie on the table. */
const laid = (state: State) => state.before.rack.filter((t) => !state.racks[state.turn].includes(t));
const sameTable = (a: number[][], b: number[][]) => a.length === b.length && a.every((set, i) => set.length === b[i].length && set.every((t, k) => t === b[i][k]));
/** Why the turn cannot end as the table stands, or "" when it can. */
export function trouble(state: State) {
  const mine = laid(state);
  if (!mine.length) return "내 타일을 하나 이상 내려놓아야 합니다.";
  if (state.table.some((set) => !valid(set))) return "맞지 않는 묶음이 있습니다 (붉은 바탕).";
  if (!state.opened[state.turn]) {
    const own = state.table.filter((set) => set.every((t) => mine.includes(t))),
      total = own.reduce((n, set) => n + worth(set), 0);
    if (own.reduce((n, set) => n + set.length, 0) !== mine.length) return "첫 등록 전에는 판의 묶음에 붙일 수 없습니다.";
    if (total < OPENING) return `첫 등록은 내 타일만으로 ${OPENING}점 이상이어야 합니다 (지금 ${total}점).`;
  }
  return "";
}
/** Every set the mover's rack holds: the same number in three or four colours, and runs of three or more. */
export function melds(state: State): number[][] {
  const rack = state.racks[state.turn],
    out: number[][] = [],
    byNumber = new Map<number, Map<number, number>>(),
    byColour = new Map<number, Map<number, number>>();
  for (const tile of rack) {
    if (isJoker(tile)) continue;
    const n = numberOf(tile),
      c = colourOf(tile);
    if (!byNumber.has(n)) byNumber.set(n, new Map());
    if (!byColour.has(c)) byColour.set(c, new Map());
    byNumber.get(n)!.set(c, tile);
    byColour.get(c)!.set(n, tile);
  }
  for (const colours of byNumber.values()) if (colours.size >= 3) out.push([...colours.values()]);
  for (const numbers of byColour.values()) {
    const sorted = [...numbers.keys()].sort((a, b) => a - b);
    let run: number[] = [];
    const close = () => {
      // Every stretch of three or more within the run, longest first.
      for (let length = run.length; length >= 3; length--) for (let i = 0; i + length <= run.length; i++) out.push(run.slice(i, i + length).map((n) => numbers.get(n)!));
      run = [];
    };
    for (const n of sorted) {
      if (run.length && n !== run[run.length - 1] + 1) close();
      run.push(n);
    }
    close();
  }
  return out.sort((a, b) => worth(b) - worth(a) || a[0] - b[0]);
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const me = state.turn,
    rack = state.racks[me],
    mine = laid(state),
    out: Move[] = [],
    tool = (to: number) => out.push({ from: -1, to, extra: -1 });
  // My own tiles may always be moved; the tiles that lay on the table only once I have opened.
  const movable = [...rack, ...state.table.flat().filter((t) => mine.includes(t) || state.opened[me])];
  for (const tile of movable) {
    const at = state.table.findIndex((set) => set.includes(tile));
    state.table.forEach((_, i) => i !== at && out.push({ from: tile, to: SET_BASE + i, extra: -1 }));
    if (at < 0 || state.table[at].length > 1) out.push({ from: tile, to: NEW_SET, extra: -1 });
    if (at >= 0 && mine.includes(tile)) out.push({ from: tile, to: TO_RACK, extra: -1 });
  }
  const changed = mine.length > 0 || !sameTable(state.table, state.before.table);
  if (changed) tool(RESET);
  if (changed && !trouble(state)) tool(END);
  if (!changed) tool(DRAW);
  // Whole sets from the rack: no place on the table stands for these, so only a computer makes them.
  melds(state).forEach((_, k) => tool(MELD_BASE + k));
  return out;
}
/** Hands the turn over, with the table as it stands as the new starting point. */
function pass(state: State, idle: boolean): State {
  const me = state.turn,
    other = (me ? 0 : 1) as 0 | 1,
    next: State = { ...state, turn: other, before: { table: state.table.map((set) => set.slice()), rack: state.racks[other].slice() }, idle: idle ? state.idle + 1 : 0, ply: state.ply + 1 };
  if (!state.racks[me].length) next.winner = me;
  else if (next.idle >= 2) {
    // Nobody can go on: the lighter rack wins.
    const weight = (side: number) => state.racks[side].reduce((n, t) => n + (isJoker(t) ? 30 : numberOf(t)), 0),
      a = weight(0),
      b = weight(1);
    next.winner = a === b ? "draw" : a < b ? 0 : 1;
  }
  return next;
}
export function play(state: State, move: Move): State | null {
  if (move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const me = state.turn,
    racks: [number[], number[]] = [state.racks[0].slice(), state.racks[1].slice()];
  if (move.from === -1) {
    if (move.to === RESET) {
      racks[me] = state.before.rack.slice();
      return { ...state, racks, table: state.before.table.map((set) => set.slice()), last: null };
    }
    if (move.to === END) {
      const opened: [boolean, boolean] = [state.opened[0], state.opened[1]];
      opened[me] = true;
      return pass({ ...state, opened, last: null }, false);
    }
    if (move.to === DRAW) {
      if (!state.pool.length) return pass({ ...state, last: null }, true);
      const pool = state.pool.slice();
      racks[me].push(pool.pop()!);
      return pass({ ...state, racks, pool, last: null }, false);
    }
    const set = melds(state)[move.to - MELD_BASE];
    racks[me] = racks[me].filter((t) => !set.includes(t));
    return { ...state, racks, table: [...state.table, set], last: set[0] };
  }
  const tile = move.from;
  let table = state.table.map((set) => without(set, tile));
  racks[me] = without(racks[me], tile);
  if (move.to === TO_RACK) racks[me].push(tile);
  else if (move.to === NEW_SET) table.push([tile]);
  else table[move.to - SET_BASE].push(tile);
  // A set left empty is gone; the points of the sets after it shift down, as the views expect.
  table = table.filter((set) => set.length);
  return { ...state, racks, table, last: tile };
}
/**
 * The computer's step, from its own rack and the table alone: it lays the
 * sets its rack holds (thirty points' worth first), then fits single tiles
 * to the sets on the table, and draws when it can do neither.
 */
export function chooseStep(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (!legal.length) return null;
  const me = state.turn,
    has = (to: number) => legal.find((m) => m.from === -1 && m.to === to),
    begun = laid(state).length > 0,
    sets = melds(state);
  // The easy level overlooks what it could lay now and then.
  if (!begun && level === "easy" && random() < 0.35 && has(DRAW)) return has(DRAW)!;
  if (sets.length) {
    // The sets it would lay this turn, heaviest first, none sharing a tile.
    const used = new Set<number>(),
      plan = sets.filter((set) => !set.some((t) => used.has(t)) && (set.forEach((t) => used.add(t)), true)),
      total = plan.reduce((n, set) => n + worth(set), 0);
    if (state.opened[me] || begun || total >= OPENING) return { from: -1, to: MELD_BASE, extra: -1 };
  }
  if (state.opened[me] && level !== "easy")
    for (const tile of state.racks[me])
      for (let i = 0; i < state.table.length; i++) if (valid([...state.table[i], tile])) return { from: tile, to: SET_BASE + i, extra: -1 };
  return has(END) ?? has(DRAW) ?? has(RESET) ?? null;
}
const effect = (state: State): Effect | null => (state.last === null ? null : { kind: "place", from: -1, to: state.last, converted: [], removed: [] });
export const tileRummy: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseStep,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => Array(TILE_COUNT).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.racks[player ? 0 : 1].length - s.racks[player].length,
  hint: (s) => {
    const changed = laid(s).length > 0 || !sameTable(s.table, s.before.table);
    if (!changed) return s.opened[s.turn] ? "타일을 내려놓거나 판의 묶음을 고쳐 짜세요. 낼 것이 없으면 한 장 가져옵니다." : `내 타일로 ${OPENING}점 이상의 묶음을 만들어 첫 등록을 하세요. 못 하면 한 장 가져옵니다.`;
    return trouble(s) || "차례를 마칠 수 있습니다.";
  },
  tally: (s) => [0, 1].map((p) => `타일 ${s.racks[p].length}개${s.opened[p] ? "" : " · 등록 전"}`) as [string, string],
  reason: (s) => (s.idle >= 2 ? "더 낼 수도 가져올 수도 없어, 남은 타일의 수가 적은 쪽이 이겼습니다." : "타일을 모두 내려놓았습니다."),
};
