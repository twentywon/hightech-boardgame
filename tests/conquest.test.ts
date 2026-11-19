import { describe, expect, it } from "vitest";
import { SIZES, bonusFor, connected, generateMap, territoryAt, type Size } from "../src/games/conquest/map";
import { compare, rollOdds, winChance } from "../src/games/conquest/odds";
import {
  MUST_TRADE,
  createGame,
  income,
  isSet,
  mustTrade,
  play,
  reachable,
  setValue,
  setsIn,
  targets,
  territoriesOf,
  type Card,
  type State,
} from "../src/games/conquest/rules";
import { decide, type Level } from "../src/games/conquest/ai";

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Dice that come up as listed, then sixes. */
function dice(...faces: number[]) {
  let k = 0;
  return () => ((faces[k++] ?? 6) - 0.5) / 6;
}
/** A game whose territories are set by hand: `owners` and `armies` for every territory in order. */
function arranged(seed: number, changes: (s: State) => void, players = 2) {
  const s = createGame({ players, size: "small", mode: "conquest" }, seeded(seed));
  changes(s);
  return s;
}
/** Two neighbouring territories, the first with a neighbour of another continent where one exists. */
function pair(s: State) {
  for (const t of s.map.territories) if (t.neighbours.length) return [t.id, t.neighbours[0]] as const;
  throw new Error("no neighbours");
}

describe("the generated world", () => {
  for (const size of ["small", "medium", "large"] as Size[])
    it(`${size}: about the right number of territories and continents, all reachable`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const map = generateMap(size, seeded(seed)),
          spec = SIZES[size];
        expect(map.continents.length).toBe(spec.continents);
        expect(map.territories.length).toBeGreaterThanOrEqual(spec.territories - 3);
        expect(map.territories.length).toBeLessThanOrEqual(spec.territories);
        expect(connected(map)).toBe(true);
        // Every continent is reached by sea and holds at least two territories.
        for (const c of map.continents) {
          expect(c.territories.length).toBeGreaterThanOrEqual(2);
          expect(c.borders).toBeGreaterThan(0);
          expect(c.bonus).toBe(bonusFor(c.territories.length, c.borders));
        }
        // Neighbours are mutual, never the territory itself, and a sea link joins two continents.
        for (const t of map.territories) {
          expect(t.neighbours).not.toContain(t.id);
          for (const n of t.neighbours) expect(map.territories[n].neighbours).toContain(t.id);
          for (const n of t.sea) expect(map.territories[n].continent).not.toBe(t.continent);
          for (const n of t.neighbours.filter((n) => !t.sea.includes(n))) expect(map.territories[n].continent).toBe(t.continent);
          // The place of its armies is inside it, as drawn.
          expect(territoryAt(map, t.x, t.y)).toBe(t.id);
          expect(t.cells).toBeGreaterThanOrEqual(5);
        }
        // Names are never repeated.
        const names = [...map.territories.map((t) => t.name), ...map.continents.map((c) => c.name)];
        expect(new Set(names).size).toBe(names.length);
      }
    });
  it("is the same world for the same seed, and another for another", () => {
    const a = generateMap("medium", seeded(77)),
      b = generateMap("medium", seeded(77)),
      c = generateMap("medium", seeded(78));
    expect([...a.cell]).toEqual([...b.cell]);
    expect(a.territories.map((t) => t.name)).toEqual(b.territories.map((t) => t.name));
    expect(a.links).toEqual(b.links);
    expect([...a.cell]).not.toEqual([...c.cell]);
    expect(createGame({ players: 3, size: "small", mode: "conquest" }, seeded(5)).owner).toEqual(createGame({ players: 3, size: "small", mode: "conquest" }, seeded(5)).owner);
  });
  it("gives more for more territories and less for fewer ways in", () => {
    for (let t = 2; t < 12; t++)
      for (let b = 1; b < 5; b++) {
        expect(bonusFor(t + 1, b)).toBeGreaterThanOrEqual(bonusFor(t, b));
        expect(bonusFor(t, b + 1)).toBeGreaterThanOrEqual(bonusFor(t, b));
      }
    expect(bonusFor(9, 3)).toBeGreaterThan(bonusFor(3, 1));
  });
});

describe("the start and reinforcements", () => {
  it("deals every territory and the starting armies evenly", () => {
    const s = createGame({ players: 4, size: "medium", mode: "conquest" }, seeded(3)),
      counts = [0, 1, 2, 3].map((p) => territoriesOf(s, p)),
      armies = [0, 1, 2, 3].map((p) => s.owner.reduce((n, o, t) => n + (o === p ? s.armies[t] : 0), 0));
    expect(s.owner.every((o) => o >= 0 && o < 4)).toBe(true);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(new Set(armies).size).toBe(1);
    expect(s.armies.every((a) => a >= 1)).toBe(true);
    expect(s.phase).toBe("reinforce");
    expect(s.turn).toBe(0);
    expect(s.reserve).toBe(income(s, 0));
  });
  it("counts a third of the territories, at least three, and whole continents", () => {
    const s = arranged(4, (s) => s.owner.fill(1));
    const all = s.map.territories.length;
    s.owner[0] = 0;
    expect(income(s, 0)).toBe(3);
    // Eleven territories give three, twelve give four.
    for (let t = 0; t < all; t++) s.owner[t] = 1;
    // Twelve territories that finish no continent: all but one of each.
    const partial = s.map.continents.flatMap((c) => c.territories.slice(1));
    partial.slice(0, 11).forEach((t) => (s.owner[t] = 0));
    expect(income(s, 0)).toBe(3);
    s.owner[partial[11]] = 0;
    expect(income(s, 0)).toBe(4);
    s.owner.fill(1);
    // A whole continent adds its bonus.
    const continent = s.map.continents[0];
    continent.territories.forEach((t) => (s.owner[t] = 0));
    expect(income(s, 0)).toBe(Math.max(3, Math.floor(territoriesOf(s, 0) / 3)) + continent.bonus);
  });
  it("places armies one at a time or in groups, then goes on to the attack", () => {
    const s = createGame({ players: 2, size: "small", mode: "conquest" }, seeded(8)),
      mine = s.owner.indexOf(0),
      theirs = s.owner.indexOf(1);
    expect(play(s, { type: "place", territory: theirs, count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "place", territory: mine, count: s.reserve + 1 }, Math.random)).toBeNull();
    const one = play(s, { type: "place", territory: mine, count: 1 }, Math.random)!;
    expect(one.armies[mine]).toBe(s.armies[mine] + 1);
    expect(one.reserve).toBe(s.reserve - 1);
    expect(one.phase).toBe("reinforce");
    // The state given is never changed.
    expect(s.armies[mine]).toBe(one.armies[mine] - 1);
    const all = play(one, { type: "place", territory: mine, count: one.reserve }, Math.random)!;
    expect(all.reserve).toBe(0);
    expect(all.phase).toBe("attack");
  });
});

describe("dice", () => {
  it("compares the highest dice in pairs, ties to the defender", () => {
    expect(compare([6, 3, 1], [5, 3])).toEqual([1, 1]);
    expect(compare([4, 4, 4], [4, 1])).toEqual([1, 1]);
    expect(compare([2], [1, 1])).toEqual([0, 1]);
    expect(compare([6, 6], [6, 6])).toEqual([2, 0]);
    expect(compare([5, 2, 6], [1, 4])).toEqual([0, 2]);
  });
  it("knows the exact odds of a roll and of a battle", () => {
    const three = rollOdds(3, 2),
      chance = (a: number, d: number) => three.find((o) => o[0] === a && o[1] === d)?.[2] ?? 0;
    expect(chance(0, 2)).toBeCloseTo(2890 / 7776, 10);
    expect(chance(1, 1)).toBeCloseTo(2611 / 7776, 10);
    expect(chance(2, 0)).toBeCloseTo(2275 / 7776, 10);
    expect(rollOdds(1, 1).find((o) => o[1] === 1)![2]).toBeCloseTo(15 / 36, 10);
    expect(winChance(2, 1)).toBeCloseTo(15 / 36, 10);
    expect(winChance(1, 1)).toBe(0);
    expect(winChance(5, 0)).toBe(1);
    // More attackers help, more defenders hinder.
    expect(winChance(10, 5)).toBeGreaterThan(winChance(6, 5));
    expect(winChance(10, 5)).toBeGreaterThan(winChance(10, 8));
    expect(winChance(11, 10)).toBeGreaterThan(0.5);
  });
  it("rolls up to three against up to two, and a conquest moves in the dice that rolled", () => {
    const s = arranged(11, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 5;
      s.armies[b] = 1;
      s.phase = "attack";
      s.reserve = 0;
    });
    const [a, b] = pair(s);
    // Three attacking dice (5 armies), one defending die: a six beats a five.
    const won = play(s, { type: "attack", from: a, to: b }, dice(6, 2, 1, 5))!;
    expect(won.last).toMatchObject({ kind: "battle", conquered: true, moved: 3 });
    expect(won.owner[b]).toBe(0);
    expect(won.armies[b]).toBe(3);
    expect(won.armies[a]).toBe(2);
    expect(won.phase).toBe("occupy");
    expect(won.pending).toEqual({ from: a, to: b, max: 1 });
    expect(play(won, { type: "occupy", count: 2 }, Math.random)).toBeNull();
    const after = play(won, { type: "occupy", count: 1 }, Math.random)!;
    expect(after.armies[a]).toBe(1);
    expect(after.armies[b]).toBe(4);
    expect(after.phase).toBe("attack");
    // A tie goes to the defender; one army never attacks.
    const held = play(s, { type: "attack", from: a, to: b }, dice(5, 2, 1, 5))!;
    expect(held.armies[a]).toBe(4);
    expect(held.owner[b]).toBe(1);
    const weak = arranged(11, (x) => {
      Object.assign(x, s, { armies: [...s.armies], owner: [...s.owner] });
      x.armies[a] = 1;
    });
    expect(play(weak, { type: "attack", from: a, to: b }, Math.random)).toBeNull();
    expect(targets(weak, a)).toEqual([]);
  });
  it("attacks to the end in one step, leaving one army at least", () => {
    const s = arranged(12, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 5;
      s.armies[b] = 30;
      s.phase = "attack";
    });
    // Three dice lose two, then two dice lose two: one army is left and the battle stops.
    const [a] = pair(s),
      lost = play(s, { type: "attack", from: a, to: pair(s)[1], blitz: true }, dice(1, 1, 1, 6, 6, 1, 1, 6, 6))!;
    expect(lost.armies[a]).toBe(1);
    expect(lost.last?.kind === "battle" && lost.last.rolls.length).toBe(2);
    expect(lost.fights).toBe(1);
  });
});

describe("cards", () => {
  const card = (id: number, kind: Card["kind"]): Card => ({ id, kind });
  it("makes sets of three alike, one of each, or with a wild card", () => {
    expect(isSet([card(0, 0), card(1, 0), card(2, 0)])).toBe(true);
    expect(isSet([card(0, 0), card(1, 1), card(2, 2)])).toBe(true);
    expect(isSet([card(0, 0), card(1, 0), card(2, 3)])).toBe(true);
    expect(isSet([card(0, 0), card(1, 0), card(2, 1)])).toBe(false);
    expect(setsIn([card(0, 0), card(1, 0), card(2, 1), card(3, 3)])[0]).toEqual([0, 1, 3]);
  });
  it("rises in value with every set traded: 4, 6, 8, 10, 12, 15, then five more", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(setValue)).toEqual([4, 6, 8, 10, 12, 15, 20, 25]);
    let s = arranged(21, (s) => {
      s.seats[0].cards = [card(100, 0), card(101, 0), card(102, 0), card(103, 1), card(104, 2), card(105, 3)];
    });
    const before = s.reserve;
    s = play(s, { type: "trade", cards: [100, 101, 102] }, Math.random)!;
    expect(s.reserve).toBe(before + 4);
    expect(play(s, { type: "trade", cards: [103, 104, 999] }, Math.random)).toBeNull();
    s = play(s, { type: "trade", cards: [103, 104, 105] }, Math.random)!;
    expect(s.reserve).toBe(before + 10);
    expect(s.trades).toBe(2);
    expect(s.seats[0].cards).toEqual([]);
    expect(s.discard.length).toBe(6);
  });
  it("must trade at five cards before placing", () => {
    const s = arranged(22, (s) => {
      s.seats[0].cards = [card(100, 0), card(101, 1), card(102, 1), card(103, 0), card(104, 2)];
    });
    expect(s.seats[0].cards.length).toBe(MUST_TRADE);
    expect(mustTrade(s)).toBe(true);
    expect(play(s, { type: "place", territory: s.owner.indexOf(0), count: 1 }, Math.random)).toBeNull();
    const traded = play(s, { type: "trade", cards: setsIn(s.seats[0].cards)[0] }, Math.random)!;
    expect(mustTrade(traded)).toBe(false);
    expect(play(traded, { type: "place", territory: s.owner.indexOf(0), count: 1 }, Math.random)).not.toBeNull();
  });
  it("draws one card for a turn that took a territory, none for one that did not", () => {
    let s = arranged(23, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 6;
      s.armies[b] = 1;
      s.owner[s.map.territories.findIndex((t, i) => i !== a && i !== b && !t.neighbours.includes(b))] = 1;
      s.phase = "attack";
    });
    const [a, b] = pair(s),
      deck = s.deck.length;
    const quiet = play(play(s, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    expect(quiet.turn).toBe(1);
    expect(quiet.seats[0].cards.length).toBe(0);
    s = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    s = play(s, { type: "occupy", count: 0 }, Math.random)!;
    s = play(play(s, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    expect(s.seats[0].cards.length).toBe(1);
    expect(s.deck.length).toBe(deck - 1);
    expect(s.last).toMatchObject({ kind: "turn", drew: true, player: 1 });
  });
  it("takes the cards of a player knocked out, and trades them at once at five or more", () => {
    const s = arranged(
      24,
      (s) => {
        const [a, b] = pair(s);
        s.owner.fill(2);
        s.owner[a] = 0;
        s.owner[b] = 1;
        s.armies[a] = 6;
        s.armies[b] = 1;
        s.seats[0].cards = [card(100, 0), card(101, 1)];
        s.seats[1].cards = [card(102, 2), card(103, 0), card(104, 0)];
        s.phase = "attack";
      },
      3,
    );
    const [a, b] = pair(s),
      won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.seats[1].alive).toBe(false);
    expect(won.seats[1].cards).toEqual([]);
    expect(won.seats[0].cards.length).toBe(5);
    expect(won.last).toMatchObject({ eliminated: true, taken: 3 });
    const moved = play(won, { type: "occupy", count: 2 }, Math.random)!;
    expect(moved.phase).toBe("reinforce");
    expect(moved.resume).toBe(true);
    expect(mustTrade(moved)).toBe(true);
    const traded = play(moved, { type: "trade", cards: setsIn(moved.seats[0].cards)[0] }, Math.random)!;
    const placed = play(traded, { type: "place", territory: a, count: traded.reserve }, Math.random)!;
    expect(placed.phase).toBe("attack");
    // A player knocked out is passed over.
    const ended = play(play(placed, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    expect(ended.turn).toBe(2);
  });
});

describe("fortifying and the turn", () => {
  it("moves once along territories of one's own, then the turn passes", () => {
    const s = arranged(31, (s) => {
      s.owner.fill(1);
      // A chain of three of mine inside one continent.
      const c = s.map.continents.find((c) => c.territories.length >= 3)!,
        [x] = c.territories,
        y = s.map.territories[x].neighbours.find((n) => c.territories.includes(n))!,
        z = s.map.territories[y].neighbours.find((n) => n !== x && c.territories.includes(n))!;
      for (const t of [x, y, z]) s.owner[t] = 0;
      s.armies[x] = 7;
      s.phase = "fortify";
    });
    const mine = s.owner.flatMap((o, t) => (o === 0 ? [t] : [])),
      x = mine.find((t) => s.armies[t] === 7)!,
      far = reachable(s, x);
    expect(far.length).toBe(2);
    const other = s.owner.indexOf(1);
    expect(play(s, { type: "fortify", from: x, to: other, count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "fortify", from: x, to: far[0], count: 7 }, Math.random)).toBeNull();
    const moved = play(s, { type: "fortify", from: x, to: far[1], count: 6 }, Math.random)!;
    expect(moved.armies[x]).toBe(1);
    expect(moved.armies[far[1]]).toBe(s.armies[far[1]] + 6);
    expect(moved.turn).toBe(1);
    expect(moved.phase).toBe("reinforce");
  });
});

describe("winning", () => {
  it("정복: taking the last territory wins", () => {
    const s = arranged(41, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(0);
      s.owner[b] = 1;
      s.armies[a] = 4;
      s.armies[b] = 1;
      s.phase = "attack";
    });
    const [a, b] = pair(s),
      won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.phase).toBe("over");
    expect(won.winners).toEqual([0]);
    expect(won.end).toBe("conquest");
    expect(play(won, { type: "next" }, Math.random)).toBeNull();
  });
  it("수도 점령: holding every capital wins", () => {
    const base = createGame({ players: 3, size: "small", mode: "capitals" }, seeded(42)),
      capitals = base.seats.map((seat) => seat.capital);
    expect(capitals.every((t, p) => t >= 0 && base.owner[t] === p)).toBe(true);
    // I hold two capitals and attack the third from beside it.
    const s = { ...base, owner: [...base.owner], armies: [...base.armies], seats: base.seats.map((x) => ({ ...x })), phase: "attack" as const };
    const last = capitals[2],
      from = s.map.territories[last].neighbours[0];
    s.owner[from] = 0;
    s.owner[capitals[1]] = 0;
    s.armies[from] = 5;
    s.armies[last] = 1;
    const won = play(s, { type: "attack", from, to: last }, dice(6, 6, 6, 1))!;
    expect(won.phase).toBe("over");
    expect(won.winners).toEqual([0]);
    expect(won.end).toBe("capitals");
    // The players who lost their capitals were still in the game.
    expect(won.seats[1].alive).toBe(true);
  });
  it("턴 제한: the most territories after the last round wins", () => {
    let s = createGame({ players: 2, size: "small", mode: "turns", rounds: 2 }, seeded(43));
    s = { ...s, owner: s.owner.map((_, t) => (t < 11 ? 1 : 0)) };
    for (let turns = 0; turns < 4; turns++) {
      s = play(s, { type: "place", territory: s.owner.indexOf(s.turn), count: s.reserve }, Math.random)!;
      s = play(play(s, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    }
    expect(s.phase).toBe("over");
    expect(s.end).toBe("turns");
    expect(s.winners).toEqual([1]);
    expect(s.round).toBe(2);
  });
  it("ends once no person is left at the screen", () => {
    const s = createGame({ players: 3, size: "small", mode: "conquest", people: 1 }, seeded(44)),
      x: State = { ...s, owner: [...s.owner], armies: [...s.armies], seats: s.seats.map((seat) => ({ ...seat })), turn: 1, phase: "attack" };
    // Seat 0 keeps one territory, and seat 1 takes it.
    const target = x.map.territories.find((t) => t.neighbours.length)!,
      from = target.neighbours[0];
    x.owner = x.owner.map(() => 2);
    x.owner[target.id] = 0;
    x.owner[from] = 1;
    x.armies[from] = 6;
    x.armies[target.id] = 1;
    const won = play(x, { type: "attack", from, to: target.id }, dice(6, 6, 6, 1))!;
    expect(won.phase).toBe("over");
    expect(won.end).toBe("people");
    expect(won.winners).toEqual([2]);
  });
});

describe("the computer", () => {
  function selfPlay(seed: number, players: number, size: Size, levels: Level[], mode: "conquest" | "capitals" = "conquest") {
    const random = seeded(seed);
    let s = createGame({ players, size, mode }, random),
      steps = 0,
      turns = 0;
    while (s.phase !== "over" && turns < 400) {
      const action = decide(s, levels[s.turn % levels.length], random),
        next = play(s, action, random);
      expect(next, `${JSON.stringify(action)} in ${s.phase}`).not.toBeNull();
      if (next!.turn !== s.turn) turns++;
      s = next!;
      steps++;
      expect(steps).toBeLessThan(20000);
    }
    return { s, turns };
  }
  it("finishes a whole game against itself within a bounded number of turns", () => {
    for (const [seed, players, size, levels] of [
      [1, 2, "small", ["hard"]],
      [2, 3, "small", ["normal", "hard"]],
      [3, 4, "medium", ["hard", "normal", "easy"]],
      [4, 6, "large", ["hard"]],
    ] as [number, number, Size, Level[]][]) {
      const { s, turns } = selfPlay(seed, players, size, levels);
      expect(s.phase, `seed ${seed}`).toBe("over");
      expect(turns).toBeLessThan(400);
      expect(s.winners.length).toBe(1);
      expect(s.owner.every((o) => o === s.winners[0])).toBe(true);
    }
  });
  it("plays the capitals game to its end too", () => {
    const { s } = selfPlay(5, 3, "small", ["hard"], "capitals");
    expect(s.phase).toBe("over");
    expect(["capitals", "conquest"]).toContain(s.end);
  });
  it("takes a sure territory and trades the cards it must", () => {
    const s = arranged(51, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 20;
      s.armies[b] = 1;
      s.phase = "attack";
    });
    const [a] = pair(s),
      choice = decide(s, "hard", seeded(1));
    expect(choice).toMatchObject({ type: "attack", from: a, blitz: true });
    expect(choice.type === "attack" && winChance(s.armies[a], s.armies[choice.to])).toBeGreaterThan(0.9);
    const forced = arranged(52, (s) => {
      s.seats[0].cards = [0, 1, 2, 0, 1].map((kind, i) => ({ id: 200 + i, kind: kind as Card["kind"] }));
    });
    expect(decide(forced, "easy", seeded(1)).type).toBe("trade");
  });
  it("reads no card but its own", () => {
    const s = arranged(53, () => {});
    const hidden = { ...s, deck: [], seats: s.seats.map((seat, p) => (p === 0 ? seat : { ...seat, cards: seat.cards.map((c) => ({ ...c, kind: 0 as const })) })) };
    for (const level of ["easy", "normal", "hard"] as Level[]) expect(decide(hidden, level, seeded(9))).toEqual(decide(s, level, seeded(9)));
  });
});
