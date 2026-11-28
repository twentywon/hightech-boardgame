import { describe, expect, test } from "vitest";
import * as H from "../src/games/hula/rules";

/** A card by rank (1–13) and suit (0 ♠, 1 ♥, 2 ◆, 3 ♣). */
const c = (rank: number, suit = 0) => suit * 13 + rank - 1;
/** A seeded sequence, the same every run. */
function seeded(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}
/** A table laid by hand: `hands` (seat 0 first), the discard top, the stock, melds, the phase and seat. */
function table(over: Partial<H.State> & { hands: number[][] }): H.State {
  const base = H.createGame(over.hands.length - 1, 3, seeded(1));
  return { ...base, stock: [c(13, 3), c(12, 3), c(11, 3)], discard: [c(2, 3)], melds: [], phase: "meld", seat: 0, picked: [], ...over, opened: over.opened ?? over.hands.map(() => false), scores: over.scores ?? over.hands.map(() => 0) };
}
const at = (to: number, cards?: number[]): { from: number; to: number; extra: number } => ({ from: -1, to, extra: cards ? H.maskOf(cards) : -1 });

describe("hula: melds", () => {
  test("sets of three or four of a rank, runs of three or more in a suit, and 7s alone or paired", () => {
    expect(H.kindOf([c(5, 0), c(5, 1), c(5, 2)])).toBe("set");
    expect(H.kindOf([c(5, 0), c(5, 1), c(5, 2), c(5, 3)])).toBe("set");
    expect(H.kindOf([c(5, 0), c(5, 1)])).toBeNull();
    expect(H.kindOf([c(4, 1), c(5, 1), c(6, 1)])).toBe("run");
    expect(H.kindOf([c(9, 2), c(10, 2), c(11, 2), c(12, 2), c(13, 2)])).toBe("run");
    // Not of one suit, or with a gap.
    expect(H.kindOf([c(4, 1), c(5, 2), c(6, 1)])).toBeNull();
    expect(H.kindOf([c(4, 1), c(6, 1), c(7, 1)])).toBeNull();
    // The ace low or high, never round the corner.
    expect(H.kindOf([c(1, 0), c(2, 0), c(3, 0)])).toBe("run");
    expect(H.kindOf([c(12, 0), c(13, 0), c(1, 0)])).toBe("run");
    expect(H.kindOf([c(13, 0), c(1, 0), c(2, 0)])).toBeNull();
    // A 7 alone, two 7s, a 7 with its neighbour of its suit; nothing else of one or two cards.
    expect(H.kindOf([c(7, 3)])).toBe("seven");
    expect(H.kindOf([c(7, 3), c(7, 1)])).toBe("seven");
    expect(H.kindOf([c(7, 3), c(8, 3)])).toBe("seven");
    expect(H.kindOf([c(6, 2), c(7, 2)])).toBe("seven");
    expect(H.kindOf([c(7, 2), c(8, 3)])).toBeNull();
    expect(H.kindOf([c(8, 3)])).toBeNull();
    expect(H.kindOf([])).toBeNull();
    // A run laid in order, the ace at the top of Q K A.
    expect(H.ordered([c(1, 0), c(13, 0), c(12, 0)])).toEqual([c(12, 0), c(13, 0), c(1, 0)]);
    expect(H.ordered([c(3, 0), c(1, 0), c(2, 0)])).toEqual([c(1, 0), c(2, 0), c(3, 0)]);
  });
  test("cards attach to any meld on the table as long as it stays good", () => {
    const s = table({ hands: [[c(8, 1), c(5, 3), c(2, 0)], [c(9, 0)]], melds: [{ owner: 1, cards: [c(5, 0), c(5, 1), c(5, 2)] }, { owner: 1, cards: [c(7, 1)] }] });
    expect(H.attachable(s, 0, [c(5, 3)])).toBe(true);
    expect(H.attachable(s, 0, [c(8, 1)])).toBe(false);
    // A lone 7 takes its neighbour, and then grows into a run.
    expect(H.attachable(s, 1, [c(8, 1)])).toBe(true);
    const a = H.play({ ...s, picked: [c(8, 1)] }, at(H.MELD_BASE + 1))!;
    expect(a.melds[1].cards).toEqual([c(7, 1), c(8, 1)]);
    expect(a.hands[0]).toEqual([c(5, 3), c(2, 0)]);
    expect(a.opened[0]).toBe(true);
    // To someone else's set, my last-but-one card; then a discard of the last goes out.
    const b = H.play({ ...a, picked: [c(5, 3)] }, at(H.MELD_BASE))!;
    expect(b.melds[0].cards).toHaveLength(4);
    expect(H.play({ ...b, picked: [c(2, 0)] }, at(H.MELD_BASE))).toBeNull();
    const out = H.play({ ...b, picked: [c(2, 0)] }, at(H.DISCARD))!;
    expect(out.result?.winner).toBe(0);
  });
});

describe("hula: a turn", () => {
  test("I pick cards up, register them, then discard one; the next player is to draw", () => {
    let s = table({ hands: [[c(3, 1), c(4, 1), c(5, 1), c(9, 2), c(13, 0)], [c(1, 0), c(2, 3), c(10, 1)]] });
    expect(H.moves(s).some((m) => m.to === H.REGISTER)).toBe(false);
    for (const id of [c(3, 1), c(4, 1), c(5, 1)]) s = H.play(s, at(id))!;
    expect(s.picked).toHaveLength(3);
    // Picked again, a card is put back.
    expect(H.play(s, at(c(4, 1)))!.picked).toEqual([c(3, 1), c(5, 1)]);
    s = H.play(s, at(H.REGISTER))!;
    expect(s.melds).toEqual([{ owner: 0, cards: [c(3, 1), c(4, 1), c(5, 1)] }]);
    expect(s.hands[0]).toEqual([c(9, 2), c(13, 0)]);
    // Only one card picked is a discard.
    expect(H.play(s, at(H.DISCARD))).toBeNull();
    s = H.play(H.play(s, at(c(13, 0)))!, at(H.DISCARD))!;
    expect(s.discard.at(-1)).toBe(c(13, 0));
    expect(s.phase).toBe("draw");
    expect(s.seat).toBe(1);
    // A bad meld is refused.
    const bad = table({ hands: [[c(3, 1), c(4, 2), c(5, 1)], [c(1, 0)]], picked: [c(3, 1), c(4, 2), c(5, 1)] });
    expect(H.play(bad, at(H.REGISTER))).toBeNull();
  });
  test("drawing from the stock takes its top card; the turn then registers or discards", () => {
    const s = table({ hands: [[c(2, 0)], [c(3, 0)]], phase: "draw", stock: [c(9, 1), c(8, 1)] });
    const drew = H.play(s, at(H.STOCK))!;
    expect(drew.hands[0]).toEqual([c(2, 0), c(8, 1)]);
    expect(drew.stock).toEqual([c(9, 1)]);
    expect(drew.phase).toBe("meld");
  });
  test("땡큐 takes the top discard only to register it at once", () => {
    const s = table({ hands: [[c(9, 0), c(9, 1), c(2, 3)], [c(4, 0)]], phase: "draw", discard: [c(9, 2)] });
    // With nothing picked the 9 fits no meld on the table: no 땡큐.
    expect(H.play(s, at(H.THANK))).toBeNull();
    expect(H.play({ ...s, picked: [c(9, 0)] }, at(H.THANK))).toBeNull();
    const done = H.play({ ...s, picked: [c(9, 0), c(9, 1)] }, at(H.THANK))!;
    expect(done.melds[0].cards).toEqual([c(9, 0), c(9, 1), c(9, 2)]);
    expect(done.discard).toEqual([]);
    expect(done.hands[0]).toEqual([c(2, 3)]);
    expect(done.phase).toBe("meld");
    expect(done.last?.events).toContain("땡큐!");
    // A discarded 7 may always be taken and laid alone; a card that fits a meld on the table is attached to it.
    expect(H.play({ ...s, discard: [c(7, 3)] }, at(H.THANK))!.melds[0].cards).toEqual([c(7, 3)]);
    const onTable = H.play({ ...s, discard: [c(6, 2)], melds: [{ owner: 1, cards: [c(3, 2), c(4, 2), c(5, 2)] }] }, at(H.THANK))!;
    expect(onTable.melds[0].cards).toEqual([c(3, 2), c(4, 2), c(5, 2), c(6, 2)]);
    expect(H.claims(s, 0, c(9, 2))).toContain(H.maskOf([c(9, 0), c(9, 1)]));
    expect(H.claims(s, 0, c(4, 3))).toEqual([]);
  });
  test("a discard another player can register is offered to it out of turn; the claimer then plays on, and the turn goes on after it", () => {
    // Four players: I discard a 9; seat 2 holds two 9s, seat 1 (next) does not; seat 3 cannot.
    const s = table({ hands: [[c(9, 3), c(1, 1)], [c(2, 1), c(4, 1)], [c(9, 0), c(9, 1), c(12, 2)], [c(13, 1), c(5, 3)]], picked: [c(9, 3)] });
    const asked = H.play(s, at(H.DISCARD))!;
    expect(asked.phase).toBe("claim");
    expect(asked.seat).toBe(2);
    const claimed = H.play(asked, { from: -1, to: H.THANK, extra: H.maskOf([c(9, 0), c(9, 1)]) })!;
    expect(claimed.seat).toBe(2);
    expect(claimed.phase).toBe("meld");
    expect(claimed.hands[2]).toEqual([c(12, 2)]);
    // It discards its last card and goes out (it had not registered before this turn: 훌라).
    const won = H.play(claimed, { from: -1, to: H.DISCARD, extra: H.maskOf([c(12, 2)]) })!;
    expect(won.result).toMatchObject({ winner: 2, hula: true });
    // Passed up, the next player draws as usual.
    const passed = H.play(asked, { from: -1, to: H.PASS, extra: 0 })!;
    expect(passed.phase).toBe("draw");
    expect(passed.seat).toBe(1);
    // A computer's discard I can register asks me (and my picks then claim it).
    const mine = table({ hands: [[c(4, 2), c(4, 3), c(10, 0)], [c(4, 1), c(1, 0)], [c(12, 0), c(2, 2)]], seat: 1 });
    const offered = H.play(mine, { from: -1, to: H.DISCARD, extra: H.maskOf([c(4, 1)]) })!;
    expect(offered).toMatchObject({ phase: "claim", seat: 0 });
    expect(H.moves(offered).some((m) => m.to === H.PASS)).toBe(true);
    const took = H.play(H.play(H.play(offered, at(c(4, 2)))!, at(c(4, 3)))!, at(H.THANK))!;
    expect(took).toMatchObject({ phase: "meld", seat: 0 });
    expect(took.melds[0].cards).toHaveLength(3);
  });
});

describe("hula: the end of a round", () => {
  test("going out wins: the others pay their hands (A 1, J Q K 10); going out on a turn begun with nothing registered is 훌라, paid double", () => {
    expect(H.totalOf([c(1, 0), c(10, 1), c(11, 2), c(13, 3), c(7, 0)])).toBe(1 + 10 + 10 + 10 + 7);
    const s = table({ hands: [[c(3, 1), c(4, 1), c(5, 1), c(8, 0)], [c(13, 0), c(2, 1)], [c(1, 2)]], picked: [c(3, 1), c(4, 1), c(5, 1)], wasOpen: true });
    const opened = H.play(H.play(H.play(s, at(H.REGISTER))!, at(c(8, 0)))!, at(H.DISCARD))!;
    expect(opened.result).toMatchObject({ winner: 0, hula: false, gains: [13, -12, -1] });
    expect(opened.scores).toEqual([13, -12, -1]);
    const hula = H.play(H.play(H.play({ ...s, wasOpen: false }, at(H.REGISTER))!, at(c(8, 0)))!, at(H.DISCARD))!;
    expect(hula.result).toMatchObject({ winner: 0, hula: true, gains: [26, -24, -2] });
    expect(hula.last?.events).toContain("훌라!");
    // Registering the last cards goes out without a discard.
    const bare = H.play(table({ hands: [[c(7, 0)], [c(9, 1)]], picked: [c(7, 0)], wasOpen: true }), at(H.REGISTER))!;
    expect(bare.result?.winner).toBe(0);
  });
  test("when the stock runs out the lowest hand wins the round", () => {
    const s = table({ hands: [[c(10, 0), c(12, 1)], [c(2, 1), c(3, 2)], [c(1, 1), c(13, 3)]], stock: [], picked: [c(12, 1)] });
    const end = H.play(s, at(H.DISCARD))!;
    expect(end.result).toMatchObject({ winner: 1, dry: true, totals: [10, 5, 11] });
    expect(end.result!.gains).toEqual([-10, 21, -11]);
  });
  test("rounds follow one another until the last, which decides the match", () => {
    const s = table({ hands: [[c(7, 0)], [c(9, 1)]], picked: [c(7, 0)], wasOpen: true, rounds: 3, round: 1 });
    const first = H.play(s, at(H.REGISTER))!;
    expect(first.phase).toBe("scored");
    expect(first.winner).toBeNull();
    expect(H.moves(first)).toEqual([at(H.NEXT)]);
    const second = H.play(first, at(H.NEXT), seeded(5))!;
    expect(second).toMatchObject({ round: 2, phase: "draw", seat: 0, scores: first.scores });
    expect(second.hands.every((h) => h.length === H.HAND)).toBe(true);
    expect(second.stock.length + second.discard.length + second.hands.flat().length).toBe(52);
    const last = H.play({ ...s, round: 3 }, at(H.REGISTER))!;
    expect(last.winner).toBe(0);
    expect(H.moves(last)).toEqual([]);
  });
});

describe("hula: the computer", () => {
  /** A whole match played by the computer at every seat (mine too): every move it makes is legal and among the moves. */
  function match(seed: number, rivals: number, level: "easy" | "normal" | "hard") {
    const random = seeded(seed);
    let s = H.createGame(rivals, 3, random),
      plies = 0;
    const seen = { thank: 0, hula: 0, dry: 0, register: 0, attach: 0, rounds: 0 };
    while (s.winner === null && plies < 4000) {
      const move = H.chooseMove(s, level, random)!;
      expect(H.options(s)).toContainEqual(move);
      if (s.seat !== 0) expect(H.moves(s)).toContainEqual(move);
      const next = H.play(s, move, random);
      expect(next, `${seed} ${JSON.stringify(move)}`).not.toBeNull();
      if (next!.last && next!.last !== s.last) {
        const kind = next!.last.kind;
        if (kind === "thank") seen.thank++;
        if (kind === "register") seen.register++;
        if (kind === "attach") seen.attach++;
      }
      if (next!.result && !s.result) {
        seen.rounds++;
        if (next!.result.hula) seen.hula++;
        if (next!.result.dry) seen.dry++;
        expect(next!.result.gains.reduce((a, b) => a + b, 0)).toBe(0);
      }
      // No card is ever lost or doubled.
      const all = [...next!.stock, ...next!.discard, ...next!.hands.flat(), ...next!.melds.flatMap((m) => m.cards)];
      expect(new Set(all).size).toBe(52);
      expect(next!.melds.every((m) => H.valid(m.cards))).toBe(true);
      s = next!;
      plies++;
    }
    expect(s.winner).not.toBeNull();
    return seen;
  }
  test("over many seeded matches it plays only legal moves, registers, attaches and claims", () => {
    const total = { thank: 0, hula: 0, dry: 0, register: 0, attach: 0, rounds: 0 };
    for (let seed = 1; seed <= 24; seed++) {
      const seen = match(seed, 1 + (seed % 3), (["easy", "normal", "hard"] as const)[seed % 3]);
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += seen[k];
    }
    expect(total.rounds).toBe(24 * 3);
    expect(total.register).toBeGreaterThan(50);
    expect(total.attach).toBeGreaterThan(10);
    expect(total.thank).toBeGreaterThan(10);
  });
  test("it claims a discard it can register and keeps back a 7", () => {
    const s = table({ hands: [[c(2, 0)], [c(9, 0), c(9, 1), c(7, 2), c(13, 3)]], seat: 1, phase: "draw", discard: [c(9, 3)] });
    expect(H.chooseMove(s, "hard", seeded(2))).toEqual({ from: -1, to: H.THANK, extra: H.maskOf([c(9, 0), c(9, 1)]) });
    const discarding = table({ hands: [[c(2, 0)], [c(7, 2), c(13, 3), c(12, 0)]], seat: 1 });
    const move = H.chooseMove(discarding, "hard", seeded(2))!;
    expect(move.to).toBe(H.REGISTER);
    const left = H.chooseMove({ ...discarding, hands: [[c(2, 0)], [c(8, 2), c(13, 3), c(2, 1)]] }, "hard", seeded(2))!;
    expect(left).toEqual({ from: -1, to: H.DISCARD, extra: H.maskOf([c(13, 3)]) });
  });
});
