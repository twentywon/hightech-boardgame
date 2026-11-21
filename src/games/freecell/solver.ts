import type { Card } from "../patience/cards";

/**
 * A bounded best-first solver for FreeCell. Every card of FreeCell is in sight, so the hint may use it without telling
 * the player anything new. It looks first at the positions that seem nearest a win (few cards out, the next card of
 * each suit near the top, few breaks in the columns, cells free), moves runs as far as the cells and empty columns
 * allow, sends home after every move the cards the rules send home by themselves, and gives up after `budget`
 * positions.
 *
 * Cards are numbered suit × 13 + rank − 1 (their ids). A step is "this card (and what lies on it) goes to pile `to`",
 * in the piles of `rules.ts`: 0–3 the free cells, 4–7 the foundations, 8–15 the columns.
 */
export interface Step {
  card: number;
  to: number;
}
const CELL = 0,
  FOUNDATION = 4,
  COLUMN = 8;
const suitOf = (c: number) => (c / 13) | 0,
  rankOf = (c: number) => (c % 13) + 1,
  red = (c: number) => {
    const s = suitOf(c);
    return s === 1 || s === 3;
  },
  fits = (c: number, onto: number) => rankOf(c) === rankOf(onto) - 1 && red(c) !== red(onto);
interface Position {
  cols: number[][];
  /** The four cells, −1 where free. */
  cells: number[];
  home: number[];
}
function safe(c: number, home: number[]) {
  const s = suitOf(c),
    r = rankOf(c);
  if (home[s] !== r - 1) return false;
  if (r <= 2) return true;
  const other = red(c) ? [0, 2] : [1, 3];
  return home[other[0]] >= r - 1 && home[other[1]] >= r - 1;
}
/** What the rules do after every move: cards nothing could be laid on go home, from the cells and the columns. */
function settle(p: Position) {
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < 4; i++) {
      const c = p.cells[i];
      if (c >= 0 && safe(c, p.home)) {
        p.cells[i] = -1;
        p.home[suitOf(c)]++;
        changed = true;
      }
    }
    for (let col = 0; col < 8; col++) {
      const cards = p.cols[col],
        c = cards[cards.length - 1];
      if (c !== undefined && safe(c, p.home)) {
        p.cols[col] = cards.slice(0, -1);
        p.home[suitOf(c)]++;
        changed = true;
      }
    }
  }
}
const copy = (p: Position): Position => ({ cols: p.cols.slice(), cells: p.cells.slice(), home: p.home.slice() });
function key(p: Position) {
  const cols = p.cols.map((cards) => String.fromCharCode(...cards.map((c) => c + 48)));
  cols.sort();
  return String.fromCharCode(...p.cells.filter((c) => c >= 0).sort((a, b) => a - b).map((c) => c + 48)) + "|" + cols.join(",");
}
/** How far from a win a position seems: lower is nearer. */
function distance(p: Position) {
  let out = 52,
    buried = 0,
    breaks = 0;
  for (const h of p.home) out -= h;
  for (let s = 0; s < 4; s++) {
    if (p.home[s] === 13) continue;
    const want = s * 13 + p.home[s];
    for (const cards of p.cols) {
      const i = cards.indexOf(want);
      if (i >= 0) buried += cards.length - 1 - i;
    }
  }
  let used = 0,
    empty = 0;
  for (const c of p.cells) if (c >= 0) used++;
  for (const cards of p.cols) {
    if (!cards.length) empty++;
    for (let i = 1; i < cards.length; i++) if (!fits(cards[i], cards[i - 1])) breaks++;
  }
  return out * 2 + buried + breaks * 2 + used - empty * 2;
}
/** The length of the run at the bottom of a column that moves as one. */
function runLength(cards: number[]) {
  let n = cards.length ? 1 : 0;
  while (n < cards.length && fits(cards[cards.length - n], cards[cards.length - n - 1])) n++;
  return n;
}
function children(p: Position, out: { p: Position; step: Step }[]) {
  const free = p.cells.indexOf(-1),
    freeCount = p.cells.filter((c) => c < 0).length,
    emptyCols = p.cols.filter((c) => !c.length).length,
    firstEmpty = p.cols.findIndex((c) => !c.length),
    cap = (toEmpty: boolean) => (freeCount + 1) * 2 ** Math.max(0, emptyCols - (toEmpty ? 1 : 0));
  const add = (change: (q: Position) => void, step: Step) => {
    const q = copy(p);
    change(q);
    settle(q);
    out.push({ p: q, step });
  };
  // Home.
  p.cells.forEach((c, i) => {
    if (c >= 0 && p.home[suitOf(c)] === rankOf(c) - 1)
      add((q) => {
        q.cells[i] = -1;
        q.home[suitOf(c)]++;
      }, { card: c, to: FOUNDATION + suitOf(c) });
  });
  p.cols.forEach((cards, col) => {
    const c = cards[cards.length - 1];
    if (c !== undefined && p.home[suitOf(c)] === rankOf(c) - 1)
      add((q) => {
        q.cols[col] = cards.slice(0, -1);
        q.home[suitOf(c)]++;
      }, { card: c, to: FOUNDATION + suitOf(c) });
  });
  // Runs onto other columns.
  p.cols.forEach((cards, col) => {
    const run = runLength(cards);
    if (!run) return;
    p.cols.forEach((target, to) => {
      if (to === col) return;
      const onto = target[target.length - 1];
      if (onto === undefined) {
        if (to !== firstEmpty) return;
        // To an empty column: every length that fits, unless it would only move the whole column across.
        const most = Math.min(run, cap(true));
        for (let n = most; n >= 1; n--) {
          if (n === cards.length) continue;
          const i = cards.length - n;
          add((q) => {
            q.cols[to] = cards.slice(i);
            q.cols[col] = cards.slice(0, i);
          }, { card: cards[i], to: COLUMN + to });
        }
        return;
      }
      for (let n = 1; n <= run; n++) {
        const i = cards.length - n;
        if (!fits(cards[i], onto)) continue;
        if (n <= cap(false))
          add((q) => {
            q.cols[to] = target.concat(cards.slice(i));
            q.cols[col] = cards.slice(0, i);
          }, { card: cards[i], to: COLUMN + to });
        break;
      }
    });
  });
  // From the cells onto the columns.
  p.cells.forEach((c, i) => {
    if (c < 0) return;
    p.cols.forEach((target, to) => {
      const onto = target[target.length - 1];
      if (onto === undefined ? to !== firstEmpty : !fits(c, onto)) return;
      add((q) => {
        q.cells[i] = -1;
        q.cols[to] = target.concat([c]);
      }, { card: c, to: COLUMN + to });
    });
  });
  // Into a free cell.
  if (free >= 0)
    p.cols.forEach((cards, col) => {
      const c = cards[cards.length - 1];
      if (c === undefined) return;
      add((q) => {
        q.cells[free] = c;
        q.cols[col] = cards.slice(0, -1);
      }, { card: c, to: CELL + free });
    });
}
/** A heap of node numbers ordered by their scores. */
class Queue {
  private items: number[] = [];
  constructor(private score: number[]) {}
  get size() {
    return this.items.length;
  }
  push(n: number) {
    const a = this.items,
      s = this.score;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (s[a[up]] <= s[n]) break;
      a[i] = a[up];
      i = up;
    }
    a[i] = n;
  }
  pop() {
    const a = this.items,
      s = this.score,
      head = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && s[a[child + 1]] < s[a[child]]) child++;
        if (s[a[child]] >= s[last]) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return head;
  }
}
/** A position written compactly (cells in order, '/' where free, then the columns), to keep thousands waiting. */
function pack(p: Position) {
  return String.fromCharCode(...p.cells.map((c) => (c < 0 ? 47 : c + 48))) + p.cols.map((cards) => String.fromCharCode(...cards.map((c) => c + 48))).join(",");
}
function unpack(text: string): Position {
  const cells = [0, 1, 2, 3].map((i) => (text.charCodeAt(i) === 47 ? -1 : text.charCodeAt(i) - 48)),
    cols = text
      .slice(4)
      .split(",")
      .map((col) => Array.from(col, (ch) => ch.charCodeAt(0) - 48)),
    home = [13, 13, 13, 13];
  // Whatever is not on the table is home, and cards go home in order.
  for (const c of cells) if (c >= 0) home[suitOf(c)]--;
  for (const cards of cols) for (const c of cards) home[suitOf(c)]--;
  return { cols, cells, home };
}
/**
 * A way to a win from `piles` found within `budget` positions looked at, as steps (each followed by the cards that go
 * home by themselves); null when none was found.
 */
export function solve(piles: Card[][], budget = 20000): Step[] | null {
  const start: Position = {
    cols: piles.slice(COLUMN, COLUMN + 8).map((cards) => cards.map((c) => c.id)),
    cells: piles.slice(CELL, CELL + 4).map((cards) => (cards.length ? cards[0].id : -1)),
    home: [0, 1, 2, 3].map((s) => piles[FOUNDATION + s].length),
  };
  settle(start);
  const waiting: (string | null)[] = [pack(start)],
    parents = [-1],
    cards = [-1],
    targets = [-1],
    depth = [0],
    score = [distance(start)],
    queue = new Queue(score),
    seen = new Set([key(start)]);
  queue.push(0);
  const found: { p: Position; step: Step }[] = [];
  let looked = 0;
  while (queue.size && looked++ < budget) {
    const n = queue.pop(),
      p = unpack(waiting[n]!);
    // A position looked at is needed no more, except to find the way back.
    waiting[n] = null;
    if (p.home.every((h) => h === 13)) {
      const path: Step[] = [];
      for (let at = n; at > 0; at = parents[at]) path.push({ card: cards[at], to: targets[at] });
      return path.reverse();
    }
    found.length = 0;
    children(p, found);
    for (const child of found) {
      const k = key(child.p);
      if (seen.has(k)) continue;
      seen.add(k);
      const m = waiting.length;
      waiting.push(pack(child.p));
      parents.push(n);
      cards.push(child.step.card);
      targets.push(child.step.to);
      depth.push(depth[n] + 1);
      score.push(distance(child.p) + depth[n] * 0.05);
      queue.push(m);
    }
  }
  return null;
}
