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
  /** The computer takes the table apart and builds it anew round tiles of its own, in one move. */
  REBUILD = 405,
  /** The tiles picked, some of them from the table, are made into a set of their own. */
  REGROUP = 406,
  /** The computer lays a whole set from its rack in one move. */
  MELD_BASE = 500;
export const isJoker = (tile: number) => tile >= JOKER;
export const colourOf = (tile: number) => Math.floor(tile / 26);
export const numberOf = (tile: number) => (tile % 13) + 1;
export interface State {
  racks: [number[], number[]];
  pool: number[];
  table: number[][];
  /** The tiles the mover has picked up so far, from the rack or the table, to do something with together. */
  picked: number[];
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
  return { racks, pool, table: [], picked: [], before: { table: [], rack: racks[0].slice() }, opened: [false, false], turn: 0, winner: null, idle: 0, ply: 0, last: null };
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
/**
 * Splits tiles (no jokers among them) into good sets that use every one of
 * them, or returns null when that cannot be done or takes too long to find.
 */
export function partition(tiles: number[], budget = 20000): number[][] | null {
  // Tiles by colour and number; two of each exist.
  const have: number[][][] = Array.from({ length: 4 }, () => Array.from({ length: 14 }, () => []));
  for (const tile of tiles) have[colourOf(tile)][numberOf(tile)].push(tile);
  const out: number[][] = [];
  let nodes = 0;
  const solve = (): boolean => {
    if (++nodes > budget) return false;
    // The lowest tile left must head a run of its colour, or sit in a group of its number.
    let c = -1,
      n = -1;
    find: for (let number = 1; number <= 13; number++)
      for (let colour = 0; colour < 4; colour++)
        if (have[colour][number].length) {
          c = colour;
          n = number;
          break find;
        }
    if (c < 0) return true;
    // Runs upward from it: every length from three that the colour still affords.
    let reach = n;
    while (reach < 13 && have[c][reach + 1].length) reach++;
    for (let end = reach; end >= n + 2; end--) {
      const set: number[] = [];
      for (let k = n; k <= end; k++) set.push(have[c][k].pop()!);
      out.push(set);
      if (solve()) return true;
      out.pop();
      for (let k = end; k >= n; k--) have[c][k].push(set[k - n]);
    }
    // Groups of its number with two or three of the other colours.
    const others = [0, 1, 2, 3].filter((colour) => colour !== c && have[colour][n].length),
      picks = others.length === 3 ? [others, [others[0], others[1]], [others[0], others[2]], [others[1], others[2]]] : others.length === 2 ? [others] : [];
    for (const pick of picks) {
      const set = [have[c][n].pop()!, ...pick.map((colour) => have[colour][n].pop()!)];
      out.push(set);
      if (solve()) return true;
      out.pop();
      have[c][n].push(set[0]);
      pick.forEach((colour, k) => have[colour][n].push(set[k + 1]));
    }
    return false;
  };
  return solve() ? out.map((set) => set.slice()) : null;
}
const rebuilt = new WeakMap<State, { table: number[][]; used: number[] } | null>();
/**
 * The best the mover can do by taking the table apart: the table built anew
 * with as many of its own tiles worked in as it can find room for. Sets with
 * a joker are left as they stand. Null when no tile of the rack can be added.
 */
export function rebuild(state: State) {
  if (rebuilt.has(state)) return rebuilt.get(state)!;
  const me = state.turn,
    fixed = state.table.filter((set) => set.some(isJoker)),
    loose = state.table.filter((set) => !set.some(isJoker)).flat(),
    rack = state.racks[me].filter((t) => !isJoker(t)).sort((a, b) => numberOf(b) - numberOf(a)),
    used: number[] = [];
  let best: number[][] | null = null;
  if (state.opened[me] && state.table.every(valid)) {
    let again = true;
    while (again) {
      again = false;
      const rest = rack.filter((t) => !used.includes(t));
      // One tile at a time, then two together (two of the rack with one of the table make a set).
      search: for (const group of [rest.map((t) => [t]), rest.flatMap((a, i) => rest.slice(i + 1).map((b) => [a, b]))])
        for (const extra of group) {
          const sets = partition([...loose, ...used, ...extra], group[0]?.length === 1 ? 20000 : 4000);
          if (sets) {
            used.push(...extra);
            best = sets;
            again = true;
            break search;
          }
        }
    }
  }
  const result = best && used.length ? { table: [...fixed, ...best], used } : null;
  rebuilt.set(state, result);
  return result;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const me = state.turn,
    rack = state.racks[me],
    mine = laid(state),
    picked = state.picked,
    out: Move[] = [],
    tool = (to: number) => out.push({ from: -1, to, extra: -1 });
  // A tap picks a tile up or puts it back. My own tiles always; those that lay on the table only once I have opened.
  for (const tile of [...rack, ...state.table.flat().filter((t) => mine.includes(t) || state.opened[me])]) tool(tile);
  if (picked.length) {
    // Picked tiles that make a set are laid as one: straight from the rack, or regrouped when some come from the table.
    if (valid(picked)) tool(picked.every((t) => rack.includes(t)) ? NEW_SET : REGROUP);
    // They may join a set on the table that stays good with them.
    state.table.forEach((set, i) => !picked.some((t) => set.includes(t)) && valid([...set, ...picked]) && tool(SET_BASE + i));
    // Tiles laid this turn may go back to the rack.
    if (picked.every((t) => mine.includes(t))) tool(TO_RACK);
  }
  const changed = mine.length > 0 || !sameTable(state.table, state.before.table);
  if (changed || picked.length) tool(RESET);
  if (changed && !trouble(state)) tool(END);
  if (!changed) tool(DRAW);
  // A computer's shortcuts, which nothing on the table stands for, so that a person never makes them:
  // a whole set from the rack, one tile of the rack onto a set, and the table taken apart and built anew.
  melds(state).forEach((_, k) => tool(MELD_BASE + k));
  // The other two belong to the computer's side alone: a move that names a piece would change how a person's taps are read,
  // and the rebuilding takes a moment to find.
  if (me === 1) {
    for (const tile of rack) state.table.forEach((set, i) => valid([...set, tile]) && out.push({ from: tile, to: SET_BASE + i, extra: -1 }));
    if (rebuild(state)) tool(REBUILD);
  }
  return out;
}
/** Hands the turn over, with the table as it stands as the new starting point. */
function pass(state: State, idle: boolean): State {
  const me = state.turn,
    other = (me ? 0 : 1) as 0 | 1,
    next: State = { ...state, turn: other, picked: [], before: { table: state.table.map((set) => set.slice()), rack: state.racks[other].slice() }, idle: idle ? state.idle + 1 : 0, ply: state.ply + 1 };
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
      return { ...state, racks, picked: [], table: state.before.table.map((set) => set.slice()), last: null };
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
    if (move.to < TILE_COUNT) {
      const tile = move.to;
      return { ...state, picked: state.picked.includes(tile) ? without(state.picked, tile) : [...state.picked, tile], last: null };
    }
    if (move.to === NEW_SET || move.to === REGROUP || move.to === TO_RACK || (move.to >= SET_BASE && move.to < NEW_SET)) {
      // The picked tiles leave wherever they were and go together to one place.
      const picked = state.picked,
        target = move.to >= SET_BASE && move.to < NEW_SET ? state.table[move.to - SET_BASE] : null,
        table = state.table.map((set) => (set === target ? [...set, ...picked] : set.filter((t) => !picked.includes(t))));
      racks[me] = racks[me].filter((t) => !picked.includes(t));
      if (move.to === TO_RACK) racks[me].push(...picked);
      else if (!target) table.push(picked.slice());
      return { ...state, racks, picked: [], table: table.filter((set) => set.length), last: picked[0] };
    }
    if (move.to === REBUILD) {
      const plan = rebuild(state)!;
      racks[me] = racks[me].filter((t) => !plan.used.includes(t));
      return { ...state, racks, table: plan.table.map((set) => set.slice()), last: plan.used[0] };
    }
    const set = melds(state)[move.to - MELD_BASE];
    racks[me] = racks[me].filter((t) => !set.includes(t));
    return { ...state, racks, table: [...state.table, set], last: set[0] };
  }
  // The computer sets one tile of its rack onto a set.
  racks[me] = without(racks[me], move.from);
  return { ...state, racks, table: state.table.map((set, i) => (i === move.to - SET_BASE ? [...set, move.from] : set)), last: move.from };
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
  // Then the table itself: taken apart and put together again round tiles of its own.
  if (level !== "easy" && has(REBUILD)) return has(REBUILD)!;
  if (state.opened[me] && level !== "easy")
    for (const tile of state.racks[me])
      for (let i = 0; i < state.table.length; i++)
        if (valid([...state.table[i], tile]) && legal.some((m) => m.from === tile && m.to === SET_BASE + i)) return { from: tile, to: SET_BASE + i, extra: -1 };
  // Whatever it had picked up without using is put down again before the turn ends.
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
    if (s.picked.length)
      return valid(s.picked)
        ? "고른 타일이 묶음이 됩니다. 판의 버튼을 누르세요."
        : s.picked.length === 1
          ? "붙일 수 있는 묶음에 금색 칸이 떴습니다. 새 묶음을 만들려면 타일을 더 고르세요."
          : `타일 ${s.picked.length}개를 골랐습니다. 묶음이 되면 버튼이 뜹니다.`;
    if (!changed) return s.opened[s.turn] ? "타일을 내려놓거나 판의 묶음을 고쳐 짜세요. 낼 것이 없으면 한 장 가져옵니다." : `내 타일로 ${OPENING}점 이상의 묶음을 만들어 첫 등록을 하세요. 못 하면 한 장 가져옵니다.`;
    return trouble(s) || "차례를 마칠 수 있습니다.";
  },
  tally: (s) => [0, 1].map((p) => `타일 ${s.racks[p].length}개${s.opened[p] ? "" : " · 등록 전"}`) as [string, string],
  reason: (s) => (s.idle >= 2 ? "더 낼 수도 가져올 수도 없어, 남은 타일의 수가 적은 쪽이 이겼습니다." : "타일을 모두 내려놓았습니다."),
};
