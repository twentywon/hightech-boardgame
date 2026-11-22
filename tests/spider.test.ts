import { describe, expect, it } from "vitest";
import { deal, move, type Card, type State } from "../src/games/spider/rules";
import { completed } from "../src/games/spider/runs";
import { HOME_STEP, HOME_X, PILES_Z, STOCK_STEP, homeSpot, stockSpot } from "../src/games/spider/layout";

let next = 0;
const card = (rank: number, suit = 0, up = true): Card => ({ id: next++, rank, suit, up });
const run = (suit = 0, from = 13, to = 1) => Array.from({ length: from - to + 1 }, (_, i) => card(from - i, suit));
const table = (columns: Card[][], stock: Card[] = []): State => ({
  suits: 4,
  columns: [...columns, ...Array.from({ length: 10 - columns.length }, () => [card(5, 3)])],
  stock,
  done: [],
  moves: 0,
  won: false,
});

describe("Spider: the runs the view sends home", () => {
  it("finds a run completed by a move, from the king down, in the column where its king lay", () => {
    const hidden = card(9, 1, false),
      s = table([[hidden, ...run(0, 13, 2)], [card(4, 2, false), card(1)]]),
      after = move(s, 1, 1, 0)!;
    expect(after.done).toEqual([0]);
    const runs = completed(s, after);
    expect(runs).toHaveLength(1);
    expect(runs[0].column).toBe(0);
    expect(runs[0].cards.map((c) => c.rank)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    // What lay above the king, face down, is remembered so: its place is worked out as it was.
    expect(runs[0].wasUp.get(hidden.id)).toBe(false);
  });
  it("finds two runs completed by one deal, each with the card dealt to its column", () => {
    // The stock deals from its end: column 0 is dealt the last card, column 1 the one before.
    const stock = Array.from({ length: 10 }, (_, i) => i === 9 ? card(1, 0, false) : i === 8 ? card(1, 1, false) : card(7, 3, false)),
      s = table([run(0, 13, 2), run(1, 13, 2)], stock),
      after = deal(s)!;
    expect(after.done.length).toBe(2);
    const runs = completed(s, after);
    expect(runs.map((r) => r.column).sort()).toEqual([0, 1]);
    for (const r of runs) {
      expect(r.cards).toHaveLength(13);
      expect(new Set(r.cards.map((c) => c.suit)).size).toBe(1);
      expect(r.cards[12].rank).toBe(1);
      expect(r.cards[12].up).toBe(true);
    }
  });
  it("finds nothing when no run was completed", () => {
    const s = table([[card(8), card(7)], [card(8)]]);
    expect(completed(s, move(s, 0, 1, 1)!)).toEqual([]);
  });
  it("lays the completed runs between the panel and the stock, clear of the stock's piles", () => {
    expect(homeSpot(0)).toEqual({ x: HOME_X, z: PILES_Z });
    // The eighth run's right edge stays left of the fifth pile of the stock.
    expect(homeSpot(7).x + 0.5).toBeLessThan(stockSpot.x - 4 * STOCK_STEP - 0.5);
    expect(HOME_STEP).toBeGreaterThan(0);
  });
});
