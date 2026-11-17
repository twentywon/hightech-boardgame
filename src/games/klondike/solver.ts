import type { Card } from "../patience/cards";

/**
 * A bounded solver for Klondike that sees every card, used only to tell whether a deal can be won before it is laid
 * (so that the player is not dealt a hopeless game, as far as it can tell). It searches depth first, trying the
 * moves that make headway first (a card home, a hidden card uncovered, a card out of the stock round), sends home at
 * once every card nothing could be laid on any more, and gives up after `budget` positions: a deal it cannot see
 * through in that many is treated as lost, which a few winnable ones are.
 *
 * Cards are numbered suit × 13 + rank − 1. A play is "this card (and whatever lies on it) goes to pile `to`", in the
 * piles of `rules.ts` (2–5 the foundations, 6–12 the columns), which the tests follow through the rules.
 */
export interface Play {
  card: number;
  to: number;
}
const FOUNDATION = 2,
  TABLEAU = 6,
  WASTE = 1,
  STOCK = 0;
const suitOf = (c: number) => (c / 13) | 0,
  rankOf = (c: number) => (c % 13) + 1,
  red = (c: number) => {
    const s = suitOf(c);
    return s === 1 || s === 3;
  },
  fits = (c: number, onto: number) => rankOf(c) === rankOf(onto) - 1 && red(c) !== red(onto);
interface Position {
  /** Face-down and face-up cards of each column, bottom first. */
  down: number[][];
  up: number[][];
  /** Cards home in each suit. */
  home: number[];
  /** The stock round in the order the cards come up: the waste (bottom first), then the stock. */
  round: number[];
  /** How many cards of the round are on the waste. */
  at: number;
}
function safe(c: number, home: number[]) {
  const s = suitOf(c),
    r = rankOf(c);
  if (home[s] !== r - 1) return false;
  if (r <= 2) return true;
  const other = red(c) ? [0, 2] : [1, 3];
  return home[other[0]] >= r - 1 && home[other[1]] >= r - 1;
}
const copy = (p: Position): Position => ({ down: p.down.slice(), up: p.up.slice(), home: p.home.slice(), round: p.round, at: p.at });
/** Uncovers the top of a column whose face-up cards have all gone. */
function uncover(p: Position, col: number) {
  if (!p.up[col].length && p.down[col].length) {
    const down = p.down[col].slice();
    p.up[col] = [down.pop()!];
    p.down[col] = down;
  }
}
/** Sends home every card that nothing could be laid on any more; records each in `plays`. */
function settle(p: Position, plays: Play[]) {
  for (let changed = true; changed; ) {
    changed = false;
    for (let col = 0; col < 7; col++) {
      const up = p.up[col],
        c = up[up.length - 1];
      if (c === undefined || !safe(c, p.home)) continue;
      p.up[col] = up.slice(0, -1);
      p.home[suitOf(c)]++;
      plays.push({ card: c, to: FOUNDATION + suitOf(c) });
      uncover(p, col);
      changed = true;
    }
  }
}
/** Positions of the waste's top that turning the stock reaches (1-based count of cards on the waste). */
function reach(p: Position, draw: number) {
  const n = p.round.length,
    out: number[] = [];
  if (draw === 1) {
    for (let i = 1; i <= n; i++) out.push(i);
    return out;
  }
  const seen = new Set<number>();
  let at = p.at;
  while (!seen.has(at)) {
    seen.add(at);
    if (at > 0) out.push(at);
    at = at === n ? 0 : Math.min(at + 3, n);
  }
  return out;
}
function key(p: Position, draw: number) {
  const cols: string[] = [];
  for (let col = 0; col < 7; col++) cols.push(String.fromCharCode(...p.down[col].map((c) => c + 48), 47, ...p.up[col].map((c) => c + 48)));
  cols.sort();
  return String.fromCharCode(...p.home.map((h) => h + 48), 124, ...p.round.map((c) => c + 48)) + (draw === 3 ? `#${p.at}` : "") + "|" + cols.join(",");
}
interface Child {
  p: Position;
  plays: Play[];
}
/** The positions one move away, the most promising first. */
function children(p: Position, draw: number): Child[] {
  const first: Child[] = [],
    reveal: Child[] = [],
    later: Child[] = [],
    last: Child[] = [],
    empty = p.up.findIndex((up, col) => !up.length && !p.down[col].length),
    spots = reach(p, draw);
  const make = (change: (q: Position) => Play, into: Child[]) => {
    const q = copy(p),
      plays = [change(q)];
    settle(q, plays);
    into.push({ p: q, plays });
  };
  const fromRound = (i: number, q: Position) => {
    const c = q.round[i - 1];
    q.round = q.round.slice(0, i - 1).concat(q.round.slice(i));
    q.at = i - 1;
    return c;
  };
  // Home from a column or from the stock round.
  for (let col = 0; col < 7; col++) {
    const up = p.up[col],
      c = up[up.length - 1];
    if (c !== undefined && p.home[suitOf(c)] === rankOf(c) - 1)
      make((q) => {
        q.up[col] = up.slice(0, -1);
        q.home[suitOf(c)]++;
        uncover(q, col);
        return { card: c, to: FOUNDATION + suitOf(c) };
      }, first);
  }
  for (const i of spots) {
    const c = p.round[i - 1];
    if (p.home[suitOf(c)] === rankOf(c) - 1)
      make((q) => {
        fromRound(i, q);
        q.home[suitOf(c)]++;
        return { card: c, to: FOUNDATION + suitOf(c) };
      }, first);
  }
  const kingWaiting = () => p.up.some((up, col) => up.length && rankOf(up[0]) === 13 && p.down[col].length) || spots.some((i) => rankOf(p.round[i - 1]) === 13);
  // Runs between columns.
  for (let col = 0; col < 7; col++) {
    const up = p.up[col];
    if (!up.length) continue;
    const hidden = p.down[col].length > 0;
    for (let i = 0; i < up.length; i++) {
      const c = up[i];
      // A run moved off so that the card above can go home.
      const freesHome = i > 0 && p.home[suitOf(up[i - 1])] === rankOf(up[i - 1]) - 1;
      if (i > 0 && !freesHome) continue;
      for (let to = 0; to < 7; to++) {
        if (to === col) continue;
        const onto = p.up[to][p.up[to].length - 1];
        let into: Child[] | null = null;
        if (onto !== undefined) {
          if (!fits(c, onto)) continue;
          into = i > 0 ? later : hidden ? reveal : rankOf(c) !== 13 && kingWaiting() ? last : null;
        } else if (to === empty && rankOf(c) === 13 && i === 0 && hidden) into = reveal;
        if (!into) continue;
        make((q) => {
          q.up[to] = q.up[to].concat(up.slice(i));
          q.up[col] = up.slice(0, i);
          uncover(q, col);
          return { card: c, to: TABLEAU + to };
        }, into);
      }
    }
  }
  // Cards from the stock round onto the columns.
  for (const i of spots) {
    const c = p.round[i - 1];
    for (let to = 0; to < 7; to++) {
      const onto = p.up[to][p.up[to].length - 1];
      if (onto !== undefined ? !fits(c, onto) : !(to === empty && rankOf(c) === 13)) continue;
      make((q) => {
        fromRound(i, q);
        q.up[to] = q.up[to].concat([c]);
        return { card: c, to: TABLEAU + to };
      }, later);
    }
  }
  return [...first, ...reveal, ...later, ...last];
}
/** The solver's position for the piles of a deal (or a game under way). */
function positionOf(piles: Card[][]): Position {
  const code = (card: Card) => card.suit * 13 + card.rank - 1;
  const cols = piles.slice(TABLEAU, TABLEAU + 7);
  return {
    down: cols.map((cards) => cards.filter((c) => !c.up).map(code)),
    up: cols.map((cards) => cards.filter((c) => c.up).map(code)),
    home: [0, 1, 2, 3].map((s) => piles[FOUNDATION + s].length),
    round: [...piles[WASTE].map(code), ...piles[STOCK].slice().reverse().map(code)],
    at: piles[WASTE].length,
  };
}
/**
 * A way through the game from `piles` that the solver found within `budget` positions, as plays; null when it found
 * none (the game may still be winnable).
 */
export function solve(piles: Card[][], draw: 1 | 3, budget = 30000): Play[] | null {
  const start = positionOf(piles),
    plays: Play[] = [];
  settle(start, plays);
  const seen = new Set<string>();
  let nodes = 0;
  const path: Play[][] = [];
  const search = (p: Position): boolean => {
    if (p.home.every((h) => h === 13)) return true;
    const k = key(p, draw);
    if (seen.has(k) || ++nodes > budget) return false;
    seen.add(k);
    for (const child of children(p, draw)) {
      path.push(child.plays);
      if (search(child.p)) return true;
      path.pop();
      if (nodes > budget) return false;
    }
    return false;
  };
  return search(start) ? plays.concat(...path) : null;
}
/** True when the solver sees a way to win from `piles`. */
export const winnable = (piles: Card[][], draw: 1 | 3, budget = 30000) => solve(piles, draw, budget) !== null;
