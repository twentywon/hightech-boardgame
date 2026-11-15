import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as g from "../src/games/gostop/rules";

const id = (month: number, slot: number) => (month - 1) * 4 + slot;
/** A state laid out by hand: hands, floor and pile (the pile's last card is turned first). */
function laid(hands: [number[], number[]], floor: number[], pile: number[], taken: [number[], number[]] = [[], []]): g.State {
  return { ...g.createGame(seededRandom(1)), hands, floor, pile, taken };
}
describe("go-stop", () => {
  test("a deal: ten each, eight on the floor, twenty in the pile, never four of a month on the floor", () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = g.createGame(seededRandom(seed));
      expect(s.hands[0]).toHaveLength(10);
      expect(s.hands[1]).toHaveLength(10);
      expect(s.floor).toHaveLength(8);
      expect(s.pile).toHaveLength(20);
      expect(new Set([...s.hands[0], ...s.hands[1], ...s.floor, ...s.pile]).size).toBe(48);
      for (let m = 1; m <= 12; m++) expect(s.floor.filter((c) => g.monthOf(c) === m).length).toBeLessThan(4);
    }
  });
  test("the cards: five brights, nine animals, ten ribbons, and chaff worth twenty-six", () => {
    const all = Array.from({ length: 48 }, (_, i) => i);
    expect(all.filter((c) => g.kindOf(c) === "gwang")).toHaveLength(5);
    expect(all.filter((c) => g.kindOf(c) === "yeol")).toHaveLength(9);
    expect(all.filter((c) => g.kindOf(c) === "tti")).toHaveLength(10);
    expect(all.reduce((n, c) => n + g.piValue(c), 0)).toBe(26);
  });
  test("scores: brights, godori, the three ribbon sets and chaff", () => {
    const gw = [id(1, 0), id(3, 0), id(8, 0)];
    expect(g.score(gw).gwang).toBe(3);
    expect(g.score([id(1, 0), id(3, 0), id(12, 0)]).gwang).toBe(2);
    expect(g.score([...gw, id(11, 0), id(12, 0)]).gwang).toBe(15);
    expect(g.score([id(2, 0), id(4, 0), id(8, 1)]).yeol).toBe(5);
    expect(g.score([id(1, 1), id(2, 1), id(3, 1)]).tti).toBe(3);
    expect(g.score([id(6, 1), id(9, 1), id(10, 1)]).tti).toBe(3);
    expect(g.score([id(4, 1), id(5, 1), id(7, 1)]).tti).toBe(3);
    const chaff = [id(1, 2), id(1, 3), id(2, 2), id(2, 3), id(3, 2), id(3, 3), id(4, 2), id(4, 3), id(11, 1)];
    expect(g.score(chaff).counts.pi).toBe(10);
    expect(g.score(chaff).pi).toBe(1);
  });
  test("a card played onto its month takes the pair; the turned card does the same", () => {
    const s = laid([[id(1, 2), id(5, 2)], [id(6, 2), id(7, 2)]], [id(1, 3), id(2, 2), id(9, 2)], [id(10, 2), id(2, 3)]);
    const next = g.play(s, { from: -1, to: id(1, 2), extra: -1 })!;
    expect(next.taken[0].sort()).toEqual([id(1, 2), id(1, 3), id(2, 2), id(2, 3)].sort());
    expect(next.floor).toEqual([id(9, 2)]);
    expect(next.turn).toBe(1);
  });
  test("쪽 steals a chaff; 뻑 leaves three stuck; the fourth takes them all and steals", () => {
    const zzok = laid([[id(1, 2), id(5, 2)], [id(6, 2)]], [id(2, 2), id(9, 2)], [id(1, 3)], [[], [id(7, 2)]]);
    const a = g.play(zzok, { from: -1, to: id(1, 2), extra: -1 })!;
    expect(a.last!.events).toContain("쪽");
    expect(a.taken[0]).toContain(id(7, 2));
    const ppeok = laid([[id(1, 2), id(5, 2)], [id(1, 0), id(6, 2)]], [id(1, 3), id(9, 2)], [id(10, 2), id(1, 1)], [[], [id(7, 2)]]);
    const b = g.play(ppeok, { from: -1, to: id(1, 2), extra: -1 })!;
    expect(b.last!.events).toContain("뻑");
    expect(b.floor.filter((c) => g.monthOf(c) === 1)).toHaveLength(3);
    const c = g.play(b, { from: -1, to: id(1, 0), extra: -1 })!;
    expect(c.taken[1]).toEqual(expect.arrayContaining([id(1, 0), id(1, 1), id(1, 2), id(1, 3)]));
    expect(c.last!.events).toContain("뻑 먹기");
  });
  test("two of a month that differ: the player chooses which to take", () => {
    const s = laid([[id(1, 2), id(5, 2)], [id(6, 2)]], [id(1, 0), id(1, 3), id(9, 2)], [id(10, 2), id(11, 2)]);
    const asked = g.play(s, { from: -1, to: id(1, 2), extra: -1 })!;
    expect(asked.phase).toBe("choose");
    expect(g.moves(asked).map((m) => m.to).sort()).toEqual([id(1, 0), id(1, 3)].sort());
    const took = g.play(asked, { from: -1, to: id(1, 0), extra: -1 })!;
    expect(took.taken[0]).toEqual(expect.arrayContaining([id(1, 0), id(1, 2)]));
    expect(took.floor).toContain(id(1, 3));
  });
  test("seven points asks go or stop; stop wins with the doublings", () => {
    const gw = [id(1, 0), id(3, 0)];
    const s = laid([[id(8, 2), id(5, 2)], [id(6, 2), id(7, 2)]], [id(8, 0), id(9, 2)], [id(10, 2), id(4, 2)], [[...gw, id(2, 0), id(4, 0)], [id(6, 3)]]);
    const asked = g.play(s, { from: -1, to: id(8, 2), extra: -1 })!;
    // 광 3 (3점) + 고도리 미완 → only the brights: not yet seven.
    expect(asked.phase).toBe("play");
    const more = laid([[id(8, 1), id(5, 2)], [id(6, 2), id(7, 2)]], [id(8, 0), id(9, 2)], [id(10, 2), id(4, 2)], [[...gw, id(2, 0), id(4, 0)], [id(6, 3)]]);
    const ask = g.play(more, { from: -1, to: id(8, 1), extra: -1 })!;
    expect(g.score(ask.taken[0]).total).toBe(8);
    expect(ask.phase).toBe("decide");
    const stop = g.play(ask, { from: -1, to: g.STOP, extra: -1 })!;
    expect(stop.winner).toBe(0);
    // The other has no bright: 광박 doubles it.
    expect(stop.result!.notes).toContain("광박");
    expect(stop.result!.points).toBe(16);
    const go = g.play(ask, { from: -1, to: g.GO, extra: -1 })!;
    expect(go.gos[0]).toBe(1);
    expect(go.turn).toBe(1);
    expect(go.winner).toBeNull();
  });
  test("games against itself end, every card accounted for, and the computer moves only legally", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const random = seededRandom(seed);
      let s = g.createGame(random);
      for (let n = 0; n < 200 && s.winner === null; n++) {
        const move = g.choose(s, "normal", random)!;
        expect(g.moves(s).some((m) => m.to === move.to && m.from === move.from)).toBe(true);
        s = g.play(s, move)!;
        expect(s).not.toBeNull();
        const all = [...s.hands[0], ...s.hands[1], ...s.floor, ...s.pile, ...s.taken[0], ...s.taken[1]];
        expect(new Set(all).size).toBe(48);
        expect(all).toHaveLength(48);
      }
      expect(s.winner).not.toBeNull();
    }
  });
  test("the computer's choice does not depend on my hand or the pile", () => {
    const s = g.createGame(seededRandom(5)),
      turned = { ...s, turn: 1 as const },
      other = { ...turned, hands: [[...s.pile.slice(0, 10)], s.hands[1]] as [number[], number[]], pile: [...s.hands[0], ...s.pile.slice(10)] };
    expect(g.choose(turned, "normal", seededRandom(9))).toEqual(g.choose(other, "normal", seededRandom(9)));
  });
});
