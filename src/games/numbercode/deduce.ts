import { JOKER, colourOf, numberOf, tileOf, type State } from "./rules";

/**
 * What one seat can see of the table, and nothing more: its own tiles (and the
 * one it holds), every tile laid face up, the colour of every hidden tile seen
 * from its back, where each stands in its row, and the numbers said wrongly of
 * it. The computer reasons from this alone, and so does my 추리 도우미.
 */
export interface Seen {
  colour: 0 | 1;
  /** The number, when this seat may see it (0–11, or 12 for a joker); else null. */
  known: number | null;
  /** Whether it lies face up for all to see. */
  up: boolean;
  misses: readonly number[];
}
export interface Sight {
  /** The seat looking, or -1 for what everyone at the table can see. */
  seat: number;
  jokers: boolean;
  rows: Seen[][];
  /** The tiles the seat holds that are not yet in its row: the one it has drawn, or jokers dealt to it still to place. */
  holding: number[];
}
export function sight(s: State, seat: number): Sight {
  return {
    seat,
    jokers: s.jokers,
    rows: s.rows.map((row, k) => row.map((id) => ({ colour: colourOf(id), known: k === seat || s.open[id] ? numberOf(id) : null, up: s.open[id], misses: s.misses[id] }))),
    holding: seat < 0 ? [] : [...(s.seat === seat && s.held !== null ? [s.held] : []), ...(seat === 0 ? s.waiting : [])],
  };
}
/** For one hidden tile: how likely each number is (index 12 the joker), over every arrangement that fits. */
export interface Odds {
  seat: number;
  index: number;
  colour: 0 | 1;
  odds: number[];
}
interface Element {
  index: number;
  colour: 0 | 1;
  /** A numbered tile already known: the only place in the order it may take. */
  pinned: number | null;
  /** For a hidden tile: which of the 24 numbered tiles it may be. */
  allowed: boolean[];
  /** Whether it may be the joker of its colour. */
  joker: boolean;
}
const known = (view: Sight) => {
  const ids = new Set<number>();
  for (const row of view.rows) for (const seen of row) if (seen.known !== null) ids.add(tileOf(seen.known, seen.colour));
  for (const id of view.holding) ids.add(id);
  return ids;
};
/**
 * Counts, for every hidden tile of the others, the arrangements of the unknown tiles that agree with all the seat
 * can see, and how many give each number. Every arrangement is as likely as another (the tiles in the pool and in
 * another's hand fill up in the same number of ways whichever they are), so the counts are the chances.
 *
 * Exact and quick: the jokers are tried in each hidden tile of their colour or nowhere, and for each such choice the
 * numbered tiles are walked in their order 0–23, each going to the next tile of one row that may take it or to the
 * pool, with a pointer for each row as the state; a walk forward and one back give every tile's count.
 */
export function chances(view: Sight): { tiles: Odds[]; total: number } {
  const seen = known(view),
    freeJoker = [0, 1].map((c) => view.jokers && !seen.has(24 + c)),
    rows: { seat: number; els: Element[] }[] = [];
  view.rows.forEach((row, seat) => {
    if (seat === view.seat) return;
    const els: Element[] = [];
    row.forEach((tile, index) => {
      if (tile.known === JOKER) return;
      if (tile.known !== null) return els.push({ index, colour: tile.colour, pinned: tileOf(tile.known, tile.colour), allowed: [], joker: false });
      const allowed = Array.from({ length: 24 }, (_, id) => colourOf(id) === tile.colour && !seen.has(id) && !tile.misses.includes(numberOf(id)));
      els.push({ index, colour: tile.colour, pinned: null, allowed, joker: freeJoker[tile.colour] && !tile.misses.includes(JOKER) });
    });
    if (els.length) rows.push({ seat, els });
  });
  const tiles: Odds[] = [],
    counts = new Map<Element, number[]>();
  for (const row of rows)
    for (const el of row.els)
      if (el.pinned === null) {
        const odds = Array.from({ length: 13 }, () => 0);
        counts.set(el, odds);
        tiles.push({ seat: row.seat, index: el.index, colour: el.colour, odds });
      }
  // The jokers: each in one of the hidden tiles that may be it, or in the pool or a hand.
  const holders = (c: number) => [null, ...rows.flatMap((r) => r.els.filter((el) => el.pinned === null && el.colour === c && el.joker))];
  let total = 0;
  for (const black of freeJoker[0] ? holders(0) : [null])
    for (const white of freeJoker[1] ? holders(1) : [null]) {
      const jokers = new Set([black, white].filter((el): el is Element => el !== null)),
        sequences = rows.map((r) => r.els.filter((el) => !jokers.has(el))),
        found = walk(sequences, seen, (el, id, ways) => (counts.get(el)![numberOf(id)] += ways));
      total += found;
      for (const el of jokers) counts.get(el)![JOKER] += found;
    }
  if (total > 0) for (const t of tiles) t.odds = t.odds.map((x) => x / total);
  return { tiles, total };
}
/**
 * The walk over the numbered tiles in order for one choice of the jokers: how many arrangements there are, telling
 * `each` for every hidden tile and number how many of them put that number there.
 */
function walk(rows: Element[][], seen: Set<number>, each: (el: Element, id: number, ways: number) => void) {
  const lens = rows.map((r) => r.length),
    strides: number[] = [];
  let size = 1;
  for (const len of lens) {
    strides.push(size);
    size *= len + 1;
  }
  const R = rows.length,
    pointer = new Int16Array(size * R);
  for (let s = 0; s < size; s++) for (let r = 0; r < R; r++) pointer[s * R + r] = Math.floor(s / strides[r]) % (lens[r] + 1);
  // Which row's tile a known numbered tile is pinned to.
  const pins = new Map<number, { r: number; e: number }>();
  rows.forEach((els, r) => els.forEach((el, e) => el.pinned !== null && pins.set(el.pinned, { r, e })));
  /** The states one step on from `s` at tile `id`, each with the tile that took it (or null: it went elsewhere). */
  const step = (s: number, id: number, visit: (next: number, el: Element | null) => void) => {
    const pin = pins.get(id);
    if (pin) {
      if (pointer[s * R + pin.r] === pin.e) visit(s + strides[pin.r], null);
      return;
    }
    visit(s, null);
    if (seen.has(id)) return;
    for (let r = 0; r < R; r++) {
      const p = pointer[s * R + r];
      if (p < lens[r]) {
        const el = rows[r][p];
        if (el.pinned === null && el.allowed[id]) visit(s + strides[r], el);
      }
    }
  };
  const forward: Float64Array[] = [new Float64Array(size)];
  forward[0][0] = 1;
  for (let id = 0; id < 24; id++) {
    const now = forward[id],
      next = new Float64Array(size);
    for (let s = 0; s < size; s++) if (now[s]) step(s, id, (t) => (next[t] += now[s]));
    forward.push(next);
  }
  const all = size - 1,
    found = forward[24][all];
  if (!found) return 0;
  let back = new Float64Array(size);
  back[all] = 1;
  for (let id = 23; id >= 0; id--) {
    const here = new Float64Array(size),
      now = forward[id],
      later = back;
    for (let s = 0; s < size; s++)
      step(s, id, (t, el) => {
        if (!later[t]) return;
        here[s] += later[t];
        if (el && now[s]) each(el, id, now[s] * later[t]);
      });
    back = here;
  }
  return found;
}
/**
 * A looser reading, for the easy computer: each hidden tile may be any unseen number of its colour that lies between
 * the known numbers on either side of it in its row, each as likely, without weighing the rows against each other.
 */
export function loose(view: Sight): Odds[] {
  const seen = known(view),
    out: Odds[] = [];
  view.rows.forEach((row, seat) => {
    if (seat === view.seat) return;
    row.forEach((tile, index) => {
      if (tile.known !== null) return;
      let low = -1,
        high = 24;
      for (let k = index - 1; k >= 0; k--)
        if (row[k].known !== null && row[k].known !== JOKER) {
          low = tileOf(row[k].known!, row[k].colour);
          break;
        }
      for (let k = index + 1; k < row.length; k++)
        if (row[k].known !== null && row[k].known !== JOKER) {
          high = tileOf(row[k].known!, row[k].colour);
          break;
        }
      const odds = Array.from({ length: 13 }, (_, n): number => {
        if (n === JOKER) return view.jokers && !seen.has(24 + tile.colour) && !tile.misses.includes(JOKER) ? 1 : 0;
        const id = tileOf(n, tile.colour);
        return id > low && id < high && !seen.has(id) && !tile.misses.includes(n) ? 1 : 0;
      });
      const sum = odds.reduce((a, b) => a + b, 0) || 1;
      out.push({ seat, index, colour: tile.colour, odds: odds.map((x) => x / sum) });
    });
  });
  return out;
}
/** The numbers a tile may still be, in order (12 the joker). */
export const possible = (odds: number[]) => odds.flatMap((p, n) => (p > 0 ? [n] : []));
