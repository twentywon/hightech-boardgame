import { describe, expect, it } from "vitest";
import * as K from "../src/games/klondike/rules";
import * as F from "../src/games/freecell/rules";
import { solve as solveKlondike, type Play } from "../src/games/klondike/solver";
import { solve as solveFreeCell } from "../src/games/freecell/solver";
import { safeHome, type Card } from "../src/games/patience/cards";
import { seededRandom } from "../src/core/ai";

const card = (rank: number, suit: number, up = true): Card => ({ id: suit * 13 + rank - 1, rank, suit, up });
const frozen = (s: unknown) => JSON.stringify(s);
/** A Klondike game laid by hand: `piles` by the rules' numbering, missing ones empty. */
function klondike(piles: Partial<Record<number, Card[]>>, draw: 1 | 3 = 1): K.State {
  const all = Array.from({ length: K.PILES }, (_, i) => (piles[i] ?? []).map((c) => ({ ...c })));
  return { draw, piles: all, fan: Math.min(all[K.WASTE].length, draw), moves: 0, passes: 0, won: false, start: all.map((p) => p.slice()), log: [] };
}
/** A FreeCell game laid by hand. */
function freecell(piles: Partial<Record<number, Card[]>>): F.State {
  const all = Array.from({ length: F.PILES }, (_, i) => (piles[i] ?? []).map((c) => ({ ...c })));
  return { deal: 0, piles: all, moves: 0, won: false, auto: [], start: all.map((p) => p.slice()), log: [] };
}
/** The foundations of a suit holding its cards up to `rank`. */
const homeTo = (suit: number, rank: number) => Array.from({ length: rank }, (_, i) => card(i + 1, suit));
const ids = (cards: Card[]) => cards.map((c) => c.id);
/** Follows the Klondike solver's plays through the rules, turning the stock until each card it names comes up. */
function follow(state: K.State, plays: Play[]) {
  let s = state;
  for (const play of plays) {
    for (let turns = 0; ; turns++) {
      const at = s.piles.findIndex((pile) => pile.some((c) => c.id === play.card));
      const index = s.piles[at].findIndex((c) => c.id === play.card);
      if (at !== K.STOCK && (at !== K.WASTE || index === s.piles[at].length - 1)) {
        const next = K.move(s, at, index, play.to);
        expect(next, `${at}:${index} → ${play.to}`).not.toBeNull();
        s = next!;
        break;
      }
      expect(turns).toBeLessThan(60);
      s = K.turn(s)!;
    }
  }
  return s;
}

describe("Klondike", () => {
  it("deals one to seven cards to the columns, the last face up, and 24 to the stock", () => {
    const s = K.createGame("1", seededRandom(5));
    expect(s.piles.slice(K.TABLEAU).map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.piles.slice(K.TABLEAU).every((c) => c.every((x, i) => x.up === (i === c.length - 1)))).toBe(true);
    expect(s.piles[K.STOCK]).toHaveLength(24);
    expect(s.piles[K.STOCK].every((c) => !c.up)).toBe(true);
    expect(new Set(s.piles.flat().map((c) => c.id)).size).toBe(52);
    expect(K.createGame("3", seededRandom(5)).draw).toBe(3);
  });
  it("builds down in alternate colours, takes only a king to an empty column, and builds home from the ace", () => {
    const s = klondike({
      [K.TABLEAU]: [card(9, 2, false), card(7, 1)],
      [K.TABLEAU + 1]: [card(8, 0)],
      [K.TABLEAU + 2]: [card(8, 3)],
      [K.TABLEAU + 3]: [card(13, 1), card(12, 0)],
      [K.WASTE]: [card(2, 1), card(1, 1)],
    });
    expect(K.accepts(s, K.TABLEAU, 1, K.TABLEAU + 1)).toBe(true);
    // Red on red, and anything but a king on an empty column, are refused.
    expect(K.accepts(s, K.TABLEAU, 1, K.TABLEAU + 2)).toBe(false);
    expect(K.accepts(s, K.TABLEAU, 1, K.TABLEAU + 4)).toBe(false);
    expect(K.accepts(s, K.TABLEAU + 3, 0, K.TABLEAU + 4)).toBe(true);
    // A face-down card cannot be picked up; only the top of the waste can.
    expect(K.canPick(s, K.TABLEAU, 0)).toBe(false);
    expect(K.canPick(s, K.WASTE, 0)).toBe(false);
    expect(K.move(s, K.WASTE, 0, K.FOUNDATION + 1)).toBeNull();
    const moved = K.move(s, K.TABLEAU, 1, K.TABLEAU + 1)!;
    // The card left on top is turned up.
    expect(moved.piles[K.TABLEAU]).toEqual([card(9, 2, true)]);
    expect(ids(moved.piles[K.TABLEAU + 1])).toEqual(ids([card(8, 0), card(7, 1)]));
    // Any foundation stands for the card's own; the ace goes first, then the two.
    const ace = K.move(moved, K.WASTE, 1, K.FOUNDATION)!;
    expect(ids(ace.piles[K.FOUNDATION + 1])).toEqual([card(1, 1).id]);
    const two = K.move(ace, K.WASTE, 0, K.FOUNDATION + 3)!;
    expect(two.piles[K.FOUNDATION + 1]).toHaveLength(2);
    // A card may come back down from its foundation.
    expect(K.canPick(two, K.FOUNDATION + 1, 1)).toBe(true);
    expect(K.move(s, K.TABLEAU + 3, 1, K.TABLEAU + 4)).toBeNull();
    // Nothing was changed in place.
    expect(frozen(s)).toBe(frozen(klondike({ [K.TABLEAU]: [card(9, 2, false), card(7, 1)], [K.TABLEAU + 1]: [card(8, 0)], [K.TABLEAU + 2]: [card(8, 3)], [K.TABLEAU + 3]: [card(13, 1), card(12, 0)], [K.WASTE]: [card(2, 1), card(1, 1)] })));
  });
  it("turns one or three cards from the stock and turns the waste back over when the stock is empty", () => {
    const stock = [card(5, 0, false), card(6, 0, false), card(7, 0, false), card(8, 0, false)];
    const one = K.turn(klondike({ [K.STOCK]: stock }, 1))!;
    expect(ids(one.piles[K.WASTE])).toEqual([card(8, 0).id]);
    expect(one.piles[K.WASTE][0].up).toBe(true);
    let three = K.turn(klondike({ [K.STOCK]: stock }, 3))!;
    expect(ids(three.piles[K.WASTE])).toEqual(ids([card(8, 0), card(7, 0), card(6, 0)]));
    expect(three.fan).toBe(3);
    three = K.turn(three)!;
    expect(three.piles[K.STOCK]).toHaveLength(0);
    expect(three.fan).toBe(1);
    const back = K.turn(three)!;
    expect(ids(back.piles[K.STOCK])).toEqual(ids(stock));
    expect(back.piles[K.STOCK].every((c) => !c.up)).toBe(true);
    expect(back.passes).toBe(1);
    expect(K.turn(klondike({}))).toBeNull();
  });
  it("sends a card home on a double tap only where it may go", () => {
    const s = klondike({ [K.WASTE]: [card(1, 3)], [K.TABLEAU]: [card(3, 0)], [K.FOUNDATION]: homeTo(0, 1) });
    expect(K.autoTarget(s, K.WASTE, 0)).toBe(K.FOUNDATION + 3);
    expect(K.autoTarget(s, K.TABLEAU, 0)).toBeNull();
  });
  it("takes moves back by playing the game again from the deal", () => {
    let s = K.createGame("3", seededRandom(11));
    const history = [s];
    for (let i = 0; i < 40; i++) {
      const m = K.hint(s);
      if (!m) break;
      s = K.play(s, m)!;
      history.push(s);
    }
    expect(history.length).toBeGreaterThan(10);
    for (let i = history.length - 1; i > 0; i--) {
      s = K.undo(s)!;
      expect(s.piles).toEqual(history[i - 1].piles);
      expect(s.moves).toBe(i - 1);
    }
    expect(K.undo(s)).toBeNull();
  });
  it("names only legal moves in its hints and stops when nothing helps", () => {
    let won = 0;
    for (const draw of ["1", "3"])
      for (let seed = 1; seed <= 12; seed++) {
        let s = K.createGame(draw, seededRandom(seed), false);
        for (let steps = 0; ; steps++) {
          expect(steps).toBeLessThan(3000);
          const m = K.hint(s);
          if (!m) break;
          expect(K.hintText(s, m)).toMatch(/보세요\.$/);
          const next = K.play(s, m);
          expect(next).not.toBeNull();
          s = next!;
        }
        expect(s.won || K.stuck(s)).toBe(true);
        if (s.won) won++;
      }
    // Hints that see only the face-up cards still win some games.
    expect(won).toBeGreaterThan(0);
  });
  it("deals a game its solver sees through, and the solver's way wins under the rules", () => {
    for (const [draw, seed] of [["1", 3], ["3", 4], ["1", 9]] as const) {
      const s = K.createGame(draw, seededRandom(seed)),
        plays = solveKlondike(s.piles, s.draw, 5000);
      expect(plays).not.toBeNull();
      expect(follow(s, plays!).won).toBe(true);
    }
  });
});

describe("FreeCell", () => {
  const rows = (piles: Card[][]) =>
    Array.from({ length: 7 }, (_, r) =>
      piles
        .slice(F.COLUMN)
        .map((column) => column[r])
        .filter(Boolean)
        .map((c) => "A23456789TJQK"[c.rank - 1] + "SHCD"[c.suit])
        .join(" "),
    );
  it("deals the classic games by number", () => {
    expect(rows(F.layOut(1))).toEqual([
      "JD 2D 9H JC 5D 7H 7C 5H",
      "KD KC 9S 5S AD QC KH 3H",
      "2S KS 9D QD JS AS AH 3C",
      "4C 5C TS QH 4H AC 4D 7S",
      "3S TD 4S TH 8H 2C JH 7D",
      "6D 8S 8D QS 6C 3D 8C TC",
      "6S 9C 2H 6H",
    ]);
    expect(rows(F.layOut(617))[0]).toBe("7D AD 5C 3S 5S 8C 2D AH");
    const s = F.createGame(1);
    expect(s.piles.slice(F.COLUMN).map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(s.piles.flat().every((c) => c.up)).toBe(true);
    for (let i = 0; i < 200; i++) {
      const deal = F.randomDeal(seededRandom(i));
      expect(deal).toBeGreaterThanOrEqual(1);
      expect(deal).toBeLessThanOrEqual(F.DEALS);
      expect(deal).not.toBe(F.LOST_DEAL);
    }
  });
  it("moves a run only as far as the free cells and empty columns allow", () => {
    // A run of four: 9♠ 8♥ 7♣ 6♦ onto 10♥; 5 other cards fill the columns, the cells hold what is given.
    const run = [card(9, 0), card(8, 1), card(7, 2), card(6, 3)],
      busy = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [F.CELL + i, [card(13, i % 4)]]));
    const base = (cells: number, empties: number) =>
      freecell({
        ...busy(cells),
        [F.COLUMN]: [card(12, 3), ...run],
        [F.COLUMN + 1]: [card(10, 1)],
        ...Object.fromEntries(Array.from({ length: 6 - empties }, (_, i) => [F.COLUMN + 2 + i, [card(11, i % 4)]])),
      });
    // Two free cells, no empty column: 3 cards.
    expect(F.capacity(base(2, 0), false)).toBe(3);
    expect(F.move(base(2, 0), F.COLUMN, 1, F.COLUMN + 1)).toBeNull();
    expect(F.refusal(base(2, 0), F.COLUMN, 1, F.COLUMN + 1)).toMatch(/3장까지만/);
    // One free cell and one empty column: (1 + 1) × 2 = 4 onto a card, 2 into the empty column.
    expect(F.capacity(base(3, 1), false)).toBe(4);
    expect(F.capacity(base(3, 1), true)).toBe(2);
    const moved = F.move(base(3, 1), F.COLUMN, 1, F.COLUMN + 1)!;
    expect(ids(moved.piles[F.COLUMN + 1])).toEqual(ids([card(10, 1), ...run]));
    expect(F.move(base(3, 1), F.COLUMN, 1, F.COLUMN + 7)).toBeNull();
    expect(F.move(base(3, 1), F.COLUMN, 3, F.COLUMN + 7)).not.toBeNull();
    // Out of order, or onto a card it does not follow, nothing moves.
    expect(F.canPick(freecell({ [F.COLUMN]: [card(9, 0), card(8, 0)] }), F.COLUMN, 0)).toBe(false);
    expect(F.move(base(0, 2), F.COLUMN, 4, F.COLUMN + 1)).toBeNull();
    // A free cell takes one card; a taken one sends it to the next free cell.
    const cells = freecell({ [F.CELL]: [card(13, 0)], [F.COLUMN]: [card(5, 1), card(4, 0)] });
    expect(F.move(cells, F.COLUMN, 0, F.CELL + 1)).toBeNull();
    const inCell = F.move(cells, F.COLUMN, 1, F.CELL)!;
    expect(ids(inCell.piles[F.CELL + 1])).toEqual([card(4, 0).id]);
  });
  it("sends home by itself only the cards nothing could be laid on", () => {
    // Black twos are home, so the red three goes; the black three waits for the red twos.
    const s = freecell({
      [F.FOUNDATION]: homeTo(0, 2),
      [F.FOUNDATION + 1]: homeTo(1, 2),
      [F.FOUNDATION + 2]: homeTo(2, 2),
      [F.FOUNDATION + 3]: homeTo(3, 1),
      [F.COLUMN]: [card(9, 2), card(3, 1)],
      [F.COLUMN + 1]: [card(3, 0)],
      [F.COLUMN + 2]: [card(2, 3), card(4, 3)],
    });
    expect(safeHome(card(3, 1), [2, 2, 2, 1])).toBe(true);
    expect(safeHome(card(3, 0), [2, 2, 2, 1])).toBe(false);
    const next = F.move(s, F.COLUMN + 2, 1, F.CELL)!;
    // The 4♦ went to a cell; then the 3♥ went home (both black twos were), the 2♦ that the 4♦ had covered, and the 3♠
    // once both red twos were home. The 4♦ waits for the 3♦.
    expect(next.auto).toEqual([card(3, 1).id, card(2, 3).id, card(3, 0).id]);
    expect([0, 1, 2, 3].map((suit) => next.piles[F.FOUNDATION + suit].length)).toEqual([3, 3, 2, 2]);
    expect(ids(next.piles[F.CELL])).toEqual([card(4, 3).id]);
    expect(next.moves).toBe(1);
  });
  it("sends a card home on a double tap, or else to a free cell", () => {
    const s = freecell({ [F.FOUNDATION + 1]: homeTo(1, 4), [F.COLUMN]: [card(5, 1)], [F.COLUMN + 1]: [card(9, 2)] });
    expect(F.autoTarget(s, F.COLUMN, 0)).toBe(F.FOUNDATION + 1);
    expect(F.autoTarget(s, F.COLUMN + 1, 0)).toBe(F.CELL);
    const full = freecell({ 0: [card(13, 0)], 1: [card(13, 1)], 2: [card(13, 2)], 3: [card(13, 3)], [F.COLUMN]: [card(9, 2)] });
    expect(F.autoTarget(full, F.COLUMN, 0)).toBeNull();
  });
  it("takes moves back by playing the game again from the deal", () => {
    let s = F.createGame(5);
    const history = [s];
    for (let i = 0; i < 25; i++) {
      s = F.play(s, F.hint(s)!)!;
      history.push(s);
    }
    for (let i = history.length - 1; i > 0; i--) {
      s = F.undo(s)!;
      expect(s.piles).toEqual(history[i - 1].piles);
      expect(s.moves).toBe(i - 1);
    }
    expect(F.undo(s)).toBeNull();
  });
  it("wins the classic deals by its hints, every move a legal one", () => {
    for (const deal of [1, 2, 3, 617]) {
      let s = F.createGame(deal);
      for (let steps = 0; !s.won; steps++) {
        expect(steps).toBeLessThan(400);
        const m = F.hint(s);
        expect(m).not.toBeNull();
        expect(F.accepts(s, m!.from, m!.index, m!.to)).toBe(true);
        expect(F.hintText(s, m!)).toMatch(/보세요\.$/);
        s = F.play(s, m!)!;
      }
      expect(s.piles.slice(F.FOUNDATION, F.COLUMN).every((c) => c.length === 13)).toBe(true);
    }
  });
  it("finds no way through the one classic deal that cannot be won", () => {
    expect(solveFreeCell(F.createGame(F.LOST_DEAL).piles, 3000)).toBeNull();
    expect(F.stuck(F.createGame(F.LOST_DEAL))).toBe(false);
  });
});
