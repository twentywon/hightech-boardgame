import { describe, expect, it } from "vitest";
import { SIZES, bonusFor, connected, generateMap, territoryAt, type Size, type WorldMap } from "../src/games/conquest/map";
import { compare, rollOdds, winChance } from "../src/games/conquest/odds";
import {
  CARD_BONUS,
  CLASSIC_ARMIES,
  MUST_TRADE,
  TAKEN_TRADE,
  WILD,
  alive,
  createGame,
  income,
  isSet,
  missionCounts,
  missionDone,
  moveTargets,
  mustTrade,
  play,
  reachable,
  setValue,
  setsIn,
  startingArmies,
  targets,
  territoriesOf,
  type Action,
  type Card,
  type Mode,
  type State,
} from "../src/games/conquest/rules";
import { decide, type Level } from "../src/games/conquest/ai";
import { WORLD_MISSIONS, decodeRing, worldMap } from "../src/games/conquest/world";
import { WORLD_REGIONS } from "../src/games/conquest/world-data";
import { MOST_GUNS, formation, piecesFor } from "../src/games/conquest/pieces";

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
/** A game dealt at random whose territories are then set by hand. */
function arranged(seed: number, changes: (s: State) => void, players = 3, world = false) {
  const s = createGame({ players, size: "small", mode: "conquest", start: "random", world }, seeded(seed));
  changes(s);
  return s;
}
/** Two neighbouring territories. */
function pair(s: State) {
  for (const t of s.map.territories) if (t.neighbours.length) return [t.id, t.neighbours[0]] as const;
  throw new Error("no neighbours");
}
const card = (id: number, kind: Card["kind"], territory = -1): Card => ({ id, kind, territory });
/** Whether the territories of `members` are joined to each other by `map`'s neighbours alone. */
function joined(map: WorldMap, members: number[]) {
  const set = new Set(members),
    seen = new Set([members[0]]),
    queue = [members[0]];
  for (let q = 0; q < queue.length; q++) for (const n of map.territories[queue[q]].neighbours) if (set.has(n) && !seen.has(n)) seen.add(n), queue.push(n);
  return seen.size === members.length;
}

describe("the map of the real world", () => {
  const map = worldMap();
  /** The classic board's counts by continent (북아메리카, 남아메리카, 유럽, 아프리카, 아시아, 오세아니아), and its bonuses. */
  const CLASSIC_COUNTS = [9, 4, 7, 6, 12, 4],
    CLASSIC_BONUSES = [5, 2, 5, 3, 7, 2];
  it("is our own division: 44 to 48 regions, no continent with the classic board's count or bonus", () => {
    expect(map.territories.length).toBeGreaterThanOrEqual(44);
    expect(map.territories.length).toBeLessThanOrEqual(48);
    expect(map.continents.map((c) => c.name)).toEqual(["북아메리카", "남아메리카", "유럽", "아프리카", "아시아", "오세아니아"]);
    map.continents.forEach((c, i) => {
      expect(c.territories.length).not.toBe(CLASSIC_COUNTS[i]);
      expect(c.bonus).not.toBe(CLASSIC_BONUSES[i]);
      expect(c.bonus).toBe(bonusFor(c.territories.length, c.borders));
    });
    // Names are Korean and never repeated.
    const names = [...map.territories.map((t) => t.name), ...map.continents.map((c) => c.name)];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[가-힣 ·]+$/);
  });
  it("reaches every region, keeps each continent whole by its own neighbours, and joins every continent to the others", () => {
    expect(connected(map)).toBe(true);
    for (const c of map.continents) expect(joined(map, c.territories), c.name).toBe(true);
    // Continents as a graph of their own: every one has a way out, and all of them hang together.
    const links = map.continents.map(() => new Set<number>());
    for (const t of map.territories) for (const n of t.neighbours) if (map.territories[n].continent !== t.continent) links[t.continent].add(map.territories[n].continent);
    for (const set of links) expect(set.size).toBeGreaterThan(0);
    const seen = new Set([0]),
      queue = [0];
    for (let q = 0; q < queue.length; q++) for (const n of links[queue[q]]) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(map.continents.length);
  });
  it("has mutual neighbours, sea links where it says, and every place of armies inside its own region", () => {
    for (const t of map.territories) {
      expect(t.neighbours).not.toContain(t.id);
      for (const n of t.neighbours) expect(map.territories[n].neighbours).toContain(t.id);
      for (const n of t.sea) expect(t.neighbours).toContain(n);
      expect(territoryAt(map, t.x, t.y), t.name).toBe(t.id);
      expect(map.shapes![t.id].length).toBeGreaterThan(0);
    }
    const linked = (a: string, b: string) => {
      const x = map.territories.find((t) => t.name === a)!,
        y = map.territories.find((t) => t.name === b)!;
      return x.neighbours.includes(y.id);
    };
    // Real crossings: the Bering Strait (off the map's sides), Gibraltar, the Channel, Greenland to Iceland, Brazil
    // to West Africa, Korea to Japan, Indonesia to Australia; and Sinai and the Isthmus of Panama by land.
    expect(linked("알래스카", "러시아 극동")).toBe(true);
    expect(map.links.find((l) => l.wrap)).toBeTruthy();
    expect(linked("이베리아 반도", "마그레브")).toBe(true);
    expect(linked("브리튼 제도", "서유럽")).toBe(true);
    expect(linked("그린란드", "북유럽")).toBe(true);
    expect(linked("브라질 고원", "서아프리카")).toBe(true);
    expect(linked("한반도", "일본")).toBe(true);
    expect(linked("말레이 제도", "호주 중부")).toBe(true);
    expect(linked("나일 강 유역", "중동")).toBe(true);
    expect(linked("중앙아메리카", "남미 북부")).toBe(true);
    expect(linked("한반도", "중국 동부")).toBe(true);
  });
  it("keeps the lower left corner sea, for the players' figures", () => {
    for (let x = 0.2; x < map.cols * 0.23; x += 0.5) for (let y = map.rows * 0.74; y < map.rows; y += 0.5) expect(territoryAt(map, x, y)).toBe(-1);
  });
  it("reads its outlines back from the compact text", () => {
    expect([...decodeRing("AAAA")]).toEqual([0, 0, 0, 0]);
    // Steps of +1 and −1, then +1 and 0, in 64ths of a cell.
    expect([...decodeRing("CBCA")].map((v) => Math.round(v * 64))).toEqual([1, -1, 2, -1]);
    const rings = WORLD_REGIONS.flatMap((r) => r.rings.map((text) => decodeRing(text)));
    for (const ring of rings) {
      expect(ring.length % 2).toBe(0);
      expect(ring.length).toBeGreaterThanOrEqual(6);
      for (const v of ring) expect(Number.isFinite(v)).toBe(true);
    }
    // Inside the board, every point of it.
    for (const ring of rings)
      for (let i = 0; i < ring.length; i += 2) {
        expect(ring[i]).toBeGreaterThanOrEqual(0);
        expect(ring[i]).toBeLessThanOrEqual(worldMap().cols);
        expect(ring[i + 1]).toBeGreaterThanOrEqual(0);
        expect(ring[i + 1]).toBeLessThanOrEqual(worldMap().rows);
      }
  });
});

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
        for (const c of map.continents) {
          expect(c.territories.length).toBeGreaterThanOrEqual(2);
          expect(c.borders).toBeGreaterThan(0);
          expect(c.bonus).toBe(bonusFor(c.territories.length, c.borders));
        }
        for (const t of map.territories) {
          expect(t.neighbours).not.toContain(t.id);
          for (const n of t.neighbours) expect(map.territories[n].neighbours).toContain(t.id);
          for (const n of t.sea) expect(map.territories[n].continent).not.toBe(t.continent);
          for (const n of t.neighbours.filter((n) => !t.sea.includes(n))) expect(map.territories[n].continent).toBe(t.continent);
          expect(territoryAt(map, t.x, t.y)).toBe(t.id);
          expect(t.cells).toBeGreaterThanOrEqual(5);
        }
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
    expect(createGame({ players: 3, size: "small", mode: "conquest" }, seeded(5)).pool).toEqual(createGame({ players: 3, size: "small", mode: "conquest" }, seeded(5)).pool);
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

describe("starting armies", () => {
  it("are the classic numbers on the real world, and scaled to a generated one", () => {
    expect([2, 3, 4, 5, 6].map((p) => startingArmies(p, 48, false))).toEqual([40, 35, 30, 25, 20]);
    expect([2, 3, 4, 5, 6].map((p) => CLASSIC_ARMIES[p])).toEqual([40, 35, 30, 25, 20]);
    // On a smaller world fewer, always enough to hold a share and more.
    for (const territories of [16, 18, 27, 30, 42])
      for (const p of [2, 3, 4, 5, 6]) {
        const n = startingArmies(p, territories);
        expect(n).toBeLessThanOrEqual(Math.max(CLASSIC_ARMIES[p], Math.ceil(territories / (p === 2 ? 3 : p)) + 3));
        expect(n).toBeGreaterThanOrEqual(Math.ceil(territories / (p === 2 ? 3 : p)) + 3);
      }
    expect(startingArmies(3, 42)).toBe(35);
    expect(startingArmies(4, 21)).toBe(15);
    for (const players of [2, 3, 4, 5, 6]) {
      const s = createGame({ players, size: "small", mode: "conquest", world: true }, seeded(players));
      // Every seat's armies, those set down and those still to set, come to the classic number.
      s.seats.forEach((_, p) => expect(s.owner.reduce((n, o, t) => n + (o === p ? s.armies[t] : 0), 0) + s.pool[p]).toBe(CLASSIC_ARMIES[players]));
    }
  });
  it("are dealt and spread at random by the other start", () => {
    const s = createGame({ players: 4, size: "medium", mode: "conquest", start: "random" }, seeded(3)),
      counts = [0, 1, 2, 3].map((p) => territoriesOf(s, p)),
      armies = [0, 1, 2, 3].map((p) => s.owner.reduce((n, o, t) => n + (o === p ? s.armies[t] : 0), 0));
    expect(s.owner.every((o) => o >= 0 && o < 4)).toBe(true);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(new Set(armies).size).toBe(1);
    expect(armies[0]).toBe(startingArmies(4, s.map.territories.length));
    expect(s.phase).toBe("reinforce");
    expect(s.turn).toBe(0);
    expect(s.reserve).toBe(income(s, 0));
  });
});

describe("claiming", () => {
  it("takes turns claiming empty territories with one army, then one more army at a time on one's own", () => {
    let s = createGame({ players: 3, size: "small", mode: "conquest", world: true }, seeded(31));
    expect(s.phase).toBe("claim");
    expect(s.owner.every((o) => o === -1)).toBe(true);
    expect(s.pool).toEqual([35, 35, 35]);
    // Nothing but claiming: no attack, no moving on, no two armies at once.
    expect(play(s, { type: "next" }, Math.random)).toBeNull();
    expect(play(s, { type: "place", territory: 0, count: 2 }, Math.random)).toBeNull();
    const first = play(s, { type: "place", territory: 0, count: 1 }, Math.random)!;
    expect(first.owner[0]).toBe(0);
    expect(first.armies[0]).toBe(1);
    expect(first.pool[0]).toBe(34);
    expect(first.turn).toBe(1);
    expect(first.last).toMatchObject({ kind: "place", claim: true, territory: 0 });
    // A claimed territory cannot be claimed again, by anyone.
    expect(play(first, { type: "place", territory: 0, count: 1 }, Math.random)).toBeNull();
    s = first;
    const n = s.map.territories.length;
    for (let t = 1; t < n; t++) s = play(s, { type: "place", territory: t, count: 1 }, Math.random)!;
    expect(s.owner.every((o) => o >= 0)).toBe(true);
    expect([0, 1, 2].map((p) => territoriesOf(s, p))).toEqual([16, 16, 16]);
    expect(s.phase).toBe("deploy");
    expect(s.turn).toBe(0);
    // Deploying: one army at a time, on one's own only.
    const theirs = s.owner.indexOf(1),
      mine = s.owner.indexOf(0);
    expect(play(s, { type: "place", territory: theirs, count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "place", territory: mine, count: 2 }, Math.random)).toBeNull();
    while (s.phase === "deploy") s = play(s, { type: "place", territory: s.owner.indexOf(s.turn), count: 1 }, Math.random)!;
    expect(s.phase).toBe("reinforce");
    expect(s.turn).toBe(0);
    expect(s.round).toBe(1);
    expect(s.pool).toEqual([0, 0, 0]);
    for (const p of [0, 1, 2]) expect(s.owner.reduce((k, o, t) => k + (o === p ? s.armies[t] : 0), 0)).toBe(35);
    expect(s.reserve).toBe(income(s, 0));
  });
  it("lets the computer claim sensibly: a continent of its own, every army placed", () => {
    const random = seeded(32);
    let s = createGame({ players: 4, size: "small", mode: "conquest", world: true }, random),
      steps = 0;
    while (s.phase === "claim" || s.phase === "deploy") {
      s = play(s, decide(s, "hard", random), random)!;
      expect(s).not.toBeNull();
      expect(++steps).toBeLessThan(200);
    }
    expect(steps).toBe(4 * 30);
    // Someone has gathered most of a continent.
    const best = Math.max(...s.map.continents.flatMap((c) => [0, 1, 2, 3].map((p) => c.territories.filter((t) => s.owner[t] === p).length / c.territories.length)));
    expect(best).toBeGreaterThan(0.6);
  });
});

describe("two players and the neutral army", () => {
  it("deals the world in thirds by the cards, then places two armies and one neutral army a turn", () => {
    const s = createGame({ players: 2, size: "small", mode: "conquest", world: true }, seeded(41));
    expect(s.seats.length).toBe(3);
    expect(s.neutral).toBe(2);
    expect(s.seats[2].neutral).toBe(true);
    expect(alive(s)).toEqual([0, 1]);
    expect([0, 1, 2].map((p) => territoriesOf(s, p))).toEqual([16, 16, 16]);
    expect(s.armies.every((a) => a === 1)).toBe(true);
    expect(s.phase).toBe("deploy");
    expect(s.quota).toEqual({ own: 2, neutral: 1 });
    const mine = s.owner.indexOf(0),
      neutral = s.owner.indexOf(2),
      theirs = s.owner.indexOf(1);
    // The other player's territory is never mine to fill; the neutral army's takes one army only.
    expect(play(s, { type: "place", territory: theirs, count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "place", territory: neutral, count: 2 }, Math.random)).toBeNull();
    expect(play(s, { type: "place", territory: mine, count: 3 }, Math.random)).toBeNull();
    let t = play(s, { type: "place", territory: neutral, count: 1 }, Math.random)!;
    expect(t.quota).toEqual({ own: 2, neutral: 0 });
    expect(play(t, { type: "place", territory: neutral, count: 1 }, Math.random)).toBeNull();
    t = play(t, { type: "place", territory: mine, count: 2 }, Math.random)!;
    // Turn done: the other player places now; the neutral army never plays a turn.
    expect(t.turn).toBe(1);
    expect(t.quota).toEqual({ own: 2, neutral: 1 });
    expect(t.armies[mine]).toBe(3);
    expect(t.armies[neutral]).toBe(2);
    let u = t;
    while (u.phase === "deploy") {
      const own = u.owner.indexOf(u.turn);
      u = play(u, u.quota!.own > 0 ? { type: "place", territory: own, count: 1 } : { type: "place", territory: u.owner.indexOf(2), count: 1 }, Math.random)!;
      expect(u.turn).not.toBe(2);
    }
    expect(u.phase).toBe("reinforce");
    for (const p of [0, 1, 2]) expect(u.owner.reduce((k, o, x) => k + (o === p ? u.armies[x] : 0), 0)).toBe(40);
    expect(u.turn).toBe(0);
  });
  it("never lets the neutral army play, and ends the game when one player is left though neutral land remains", () => {
    const s = arranged(
      42,
      (s) => {
        const [a, b] = pair(s);
        s.owner.fill(2);
        s.owner[a] = 0;
        s.owner[b] = 1;
        s.armies[a] = 6;
        s.armies[b] = 1;
        s.seats[1].cards = [card(100, 0), card(101, 1)];
        s.phase = "attack";
      },
      2,
      true,
    );
    const [a, b] = pair(s);
    // The turn passes from 0 to 1 and back, never to the neutral seat.
    let t = play(play(s, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    expect(t.turn).toBe(1);
    t = play(t, { type: "place", territory: b, count: t.reserve }, Math.random)!;
    t = play(play(t, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    expect(t.turn).toBe(0);
    const won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.phase).toBe("over");
    expect(won.winners).toEqual([0]);
    expect(won.end).toBe("alone");
    expect(territoriesOf(won, 2)).toBeGreaterThan(0);
  });
  it("gives no cards and no knock-out for taking the neutral army's last territory", () => {
    const s = arranged(
      43,
      (s) => {
        const [a, b] = pair(s);
        s.owner.fill(1);
        s.owner[a] = 0;
        s.owner[b] = 2;
        s.armies[a] = 6;
        s.armies[b] = 1;
        s.phase = "attack";
      },
      2,
      true,
    );
    const [a, b] = pair(s),
      won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.owner[b]).toBe(0);
    expect(won.last).toMatchObject({ kind: "battle", conquered: true, eliminated: false, taken: 0 });
    expect(won.phase).not.toBe("over");
  });
});

describe("cards", () => {
  it("are one a territory naming it, the kinds dealt evenly in turn, and two wild cards", () => {
    const s = createGame({ players: 3, size: "small", mode: "conquest", world: true }, seeded(51)),
      n = s.map.territories.length,
      deck = [...s.deck];
    expect(deck.length).toBe(n + 2);
    expect(deck.filter((c) => c.kind === WILD).map((c) => c.territory)).toEqual([-1, -1]);
    const named = deck.filter((c) => c.kind !== WILD);
    expect(new Set(named.map((c) => c.territory)).size).toBe(n);
    for (const c of named) expect(c.kind).toBe(c.territory % 3);
    const kinds = [0, 1, 2].map((k) => named.filter((c) => c.kind === k).length);
    expect(Math.max(...kinds) - Math.min(...kinds)).toBeLessThanOrEqual(1);
  });
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
  it("puts two armies on one territory named on a traded card that the player holds, and on one only", () => {
    const base = arranged(22, () => {}, 3, true),
      mine = base.owner.flatMap((o, t) => (o === 0 ? [t] : [])),
      theirs = base.owner.indexOf(1);
    const s = arranged(
      22,
      (x) => {
        x.seats[0].cards = [card(mine[0], 0, mine[0]), card(mine[1], 1, mine[1]), card(theirs, 2, theirs)];
      },
      3,
      true,
    );
    // Asked for: the second.
    const chosen = play(s, { type: "trade", cards: [mine[0], mine[1], theirs], bonus: mine[1] }, Math.random)!;
    expect(chosen.armies[mine[1]]).toBe(s.armies[mine[1]] + CARD_BONUS);
    expect(chosen.armies[mine[0]]).toBe(s.armies[mine[0]]);
    expect(chosen.last).toMatchObject({ kind: "trade", bonus: mine[1] });
    // Not asked: the first held. Never another's territory, never one not on the cards.
    const first = play(s, { type: "trade", cards: [mine[0], mine[1], theirs] }, Math.random)!;
    expect(first.armies[mine[0]]).toBe(s.armies[mine[0]] + CARD_BONUS);
    expect(first.armies.reduce((a, b) => a + b, 0)).toBe(s.armies.reduce((a, b) => a + b, 0) + CARD_BONUS);
    expect(play(s, { type: "trade", cards: [mine[0], mine[1], theirs], bonus: theirs }, Math.random)).toBeNull();
    expect(play(s, { type: "trade", cards: [mine[0], mine[1], theirs], bonus: mine[2] }, Math.random)).toBeNull();
    // A set naming nothing of mine gives no bonus.
    const none = arranged(22, (x) => (x.seats[0].cards = [card(200, 0), card(201, 1), card(theirs, 2, theirs)]), 3, true),
      plain = play(none, { type: "trade", cards: [200, 201, theirs] }, Math.random)!;
    expect(plain.armies).toEqual(none.armies);
    expect(plain.last).toMatchObject({ kind: "trade", bonus: -1 });
  });
  it("must trade at five cards before placing", () => {
    const s = arranged(23, (s) => {
      s.seats[0].cards = [card(100, 0), card(101, 1), card(102, 1), card(103, 0), card(104, 2)];
    });
    expect(s.seats[0].cards.length).toBe(MUST_TRADE);
    expect(mustTrade(s)).toBe(true);
    expect(play(s, { type: "place", territory: s.owner.indexOf(0), count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "next" }, Math.random)).toBeNull();
    const traded = play(s, { type: "trade", cards: setsIn(s.seats[0].cards)[0] }, Math.random)!;
    expect(mustTrade(traded)).toBe(false);
    expect(play(traded, { type: "place", territory: s.owner.indexOf(0), count: 1 }, Math.random)).not.toBeNull();
  });
  it("draws one card for a turn that took a territory, none for one that did not", () => {
    let s = arranged(24, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 6;
      s.armies[b] = 1;
      s.owner[s.map.territories.findIndex((t, i) => i !== a && i !== b && !t.neighbours.includes(b))] = 2;
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
  it("takes the cards of a player knocked out, and at six or more trades at once down to four, places, and attacks on", () => {
    const knockOut = (theirs: Card[]) =>
      arranged(25, (s) => {
        const [a, b] = pair(s);
        s.owner.fill(2);
        s.owner[a] = 0;
        s.owner[b] = 1;
        s.armies[a] = 6;
        s.armies[b] = 1;
        s.seats[0].cards = [card(100, 0), card(101, 1), card(102, 2)];
        s.seats[1].cards = theirs;
        s.phase = "attack";
      });
    const s = knockOut([card(103, 2), card(104, 0), card(105, 0), card(106, 1)]),
      [a, b] = pair(s),
      won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.seats[1].alive).toBe(false);
    expect(won.seats[1].cards).toEqual([]);
    expect(won.seats[0].cards.length).toBe(7);
    expect(won.last).toMatchObject({ eliminated: true, taken: 4 });
    const moved = play(won, { type: "occupy", count: 2 }, Math.random)!;
    expect(moved.phase).toBe("reinforce");
    expect(moved.resume).toBe(true);
    expect(mustTrade(moved)).toBe(true);
    expect(play(moved, { type: "place", territory: a, count: 1 }, Math.random)).toBeNull();
    let traded = play(moved, { type: "trade", cards: setsIn(moved.seats[0].cards)[0] }, Math.random)!;
    // Down to four: no more trading, though a set may be left.
    expect(traded.seats[0].cards.length).toBe(4);
    expect(mustTrade(traded)).toBe(false);
    expect(play(traded, { type: "trade", cards: setsIn(traded.seats[0].cards)[0] ?? [0, 0, 0] }, Math.random)).toBeNull();
    traded = play(traded, { type: "place", territory: a, count: traded.reserve }, Math.random)!;
    expect(traded.phase).toBe("attack");
    // A player knocked out is passed over.
    const ended = play(play(traded, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    expect(ended.turn).toBe(2);
    // Five cards after a knock-out are kept until the next turn begins.
    const five = knockOut([card(103, 2), card(104, 0)]),
      took = play(play(five, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!, { type: "occupy", count: 0 }, Math.random)!;
    expect(took.seats[0].cards.length).toBe(5);
    expect(took.phase).toBe("attack");
    expect(TAKEN_TRADE).toBe(6);
  });
});

describe("army pieces", () => {
  it("show a territory's armies as the fewest pieces: 포병 10, 기병 5, 보병 1", () => {
    expect(piecesFor(17)).toEqual({ guns: 1, riders: 1, soldiers: 2 });
    expect(piecesFor(4)).toEqual({ guns: 0, riders: 0, soldiers: 4 });
    expect(piecesFor(5)).toEqual({ guns: 0, riders: 1, soldiers: 0 });
    expect(piecesFor(30)).toEqual({ guns: 3, riders: 0, soldiers: 0 });
    for (let n = 1; n <= 99; n++) {
      const { guns, riders, soldiers } = piecesFor(n);
      expect(guns * 10 + riders * 5 + soldiers).toBe(n);
      expect(riders).toBeLessThanOrEqual(1);
      expect(soldiers).toBeLessThanOrEqual(4);
      const { pieces, depth } = formation(n);
      expect(pieces.length).toBe(Math.min(MOST_GUNS, guns) + riders + soldiers);
      expect(depth).toBeGreaterThan(0);
      // Gathered round the place of the armies.
      for (const p of pieces) expect(Math.abs(p.z)).toBeLessThanOrEqual(depth / 2);
    }
    expect(formation(0).pieces).toEqual([]);
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
    expect(winChance(10, 5)).toBeGreaterThan(winChance(6, 5));
    expect(winChance(10, 5)).toBeGreaterThan(winChance(10, 8));
    expect(winChance(11, 10)).toBeGreaterThan(0.5);
  });
  it("rolls up to three against up to two, and a conquest moves in at least the dice that rolled", () => {
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
    // Fewer dice may be chosen; never more than the armies less one. Rolling two, two go in.
    expect(play(s, { type: "attack", from: a, to: b, dice: 4 }, Math.random)).toBeNull();
    const two = play(s, { type: "attack", from: a, to: b, dice: 2 }, dice(6, 2, 5))!;
    expect(two.last?.kind === "battle" && two.last.rolls[0].attack.length).toBe(2);
    expect(two.armies[b]).toBe(2);
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
  it("defends with two dice only with two armies or more", () => {
    const s = arranged(12, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 4;
      s.armies[b] = 1;
      s.phase = "attack";
    });
    const [a, b] = pair(s),
      one = play(s, { type: "attack", from: a, to: b }, dice(1, 1, 1, 6))!;
    expect(one.last?.kind === "battle" && one.last.rolls[0].defend.length).toBe(1);
    const two = play({ ...s, armies: s.armies.map((v, t) => (t === b ? 2 : v)) }, { type: "attack", from: a, to: b }, dice(1, 1, 1, 6, 6))!;
    expect(two.last?.kind === "battle" && two.last.rolls[0].defend.length).toBe(2);
  });
  it("attacks to the end in one step, leaving one army at least", () => {
    const s = arranged(13, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(1);
      s.owner[a] = 0;
      s.armies[a] = 5;
      s.armies[b] = 30;
      s.phase = "attack";
    });
    const [a] = pair(s),
      lost = play(s, { type: "attack", from: a, to: pair(s)[1], blitz: true }, dice(1, 1, 1, 6, 6, 1, 1, 6, 6))!;
    expect(lost.armies[a]).toBe(1);
    expect(lost.last?.kind === "battle" && lost.last.rolls.length).toBe(2);
    expect(lost.fights).toBe(1);
  });
});

describe("reinforcing, fortifying and the turn", () => {
  it("counts a third of the territories, at least three, and whole continents", () => {
    const s = arranged(4, (s) => s.owner.fill(1), 3, true);
    s.owner[0] = 0;
    expect(income(s, 0)).toBe(3);
    s.owner.fill(1);
    const partial = s.map.continents.flatMap((c) => c.territories.slice(1));
    partial.slice(0, 11).forEach((t) => (s.owner[t] = 0));
    expect(income(s, 0)).toBe(3);
    s.owner[partial[11]] = 0;
    expect(income(s, 0)).toBe(4);
    s.owner.fill(1);
    const continent = s.map.continents[1];
    continent.territories.forEach((t) => (s.owner[t] = 0));
    expect(income(s, 0)).toBe(3 + continent.bonus);
  });
  it("places armies one at a time or in groups, then goes on to the attack", () => {
    const s = createGame({ players: 3, size: "small", mode: "conquest", start: "random" }, seeded(8)),
      mine = s.owner.indexOf(0),
      theirs = s.owner.indexOf(1);
    expect(play(s, { type: "place", territory: theirs, count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "place", territory: mine, count: s.reserve + 1 }, Math.random)).toBeNull();
    const one = play(s, { type: "place", territory: mine, count: 1 }, Math.random)!;
    expect(one.armies[mine]).toBe(s.armies[mine] + 1);
    expect(one.reserve).toBe(s.reserve - 1);
    expect(s.armies[mine]).toBe(one.armies[mine] - 1);
    const all = play(one, { type: "place", territory: mine, count: one.reserve }, Math.random)!;
    expect(all.phase).toBe("attack");
  });
  /** A chain of three of mine inside one continent, armies on the first. */
  function chain(move: "adjacent" | "connected") {
    const s = createGame({ players: 3, size: "small", mode: "conquest", start: "random", move, world: true }, seeded(31));
    s.owner.fill(1);
    const c = s.map.continents.find((c) => c.territories.length >= 3)!,
      x = c.territories.find((t) => {
        const y = s.map.territories[t].neighbours.find((n) => c.territories.includes(n));
        return y !== undefined && s.map.territories[y].neighbours.some((z) => z !== t && c.territories.includes(z) && !s.map.territories[t].neighbours.includes(z));
      })!,
      y = s.map.territories[x].neighbours.find((n) => c.territories.includes(n) && s.map.territories[n].neighbours.some((z) => z !== x && c.territories.includes(z) && !s.map.territories[x].neighbours.includes(z)))!,
      z = s.map.territories[y].neighbours.find((n) => n !== x && c.territories.includes(n) && !s.map.territories[x].neighbours.includes(n))!;
    for (const t of [x, y, z]) s.owner[t] = 0;
    s.armies[x] = 7;
    s.phase = "fortify";
    return { s, x, y, z };
  }
  it("moves once, by the classic rule only to a neighbour of one's own, then the turn passes", () => {
    const { s, x, y, z } = chain("adjacent");
    expect(moveTargets(s, x)).toEqual([y]);
    expect(reachable(s, x).sort()).toEqual([y, z].sort());
    expect(play(s, { type: "fortify", from: x, to: z, count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "fortify", from: x, to: s.owner.indexOf(1), count: 1 }, Math.random)).toBeNull();
    expect(play(s, { type: "fortify", from: x, to: y, count: 7 }, Math.random)).toBeNull();
    const moved = play(s, { type: "fortify", from: x, to: y, count: 6 }, Math.random)!;
    expect(moved.armies[x]).toBe(1);
    expect(moved.armies[y]).toBe(s.armies[y] + 6);
    expect(moved.turn).toBe(1);
    expect(moved.phase).toBe("reinforce");
  });
  it("moves along a path of one's own by the other rule", () => {
    const { s, x, z } = chain("connected");
    expect(moveTargets(s, x)).toContain(z);
    const moved = play(s, { type: "fortify", from: x, to: z, count: 6 }, Math.random)!;
    expect(moved.armies[z]).toBe(s.armies[z] + 6);
  });
});

describe("missions", () => {
  it("deals one secret mission to each player, none to the neutral army, and never to knock out oneself", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const players = 2 + (seed % 5),
        s = createGame({ players, size: "small", mode: "missions", world: true }, seeded(seed));
      s.seats.forEach((seat, p) => {
        if (seat.neutral) return expect(seat.mission).toBeNull();
        expect(seat.mission).not.toBeNull();
        if (seat.mission!.kind === "destroy") {
          expect(seat.mission!.target).not.toBe(p);
          expect(seat.mission!.target).toBeLessThan(players);
        }
      });
    }
    expect(createGame({ players: 3, size: "small", mode: "conquest", world: true }, seeded(1)).seats.every((seat) => !seat.mission)).toBe(true);
    // Our own pairs of continents on the world map, and the numbers of territories of the classic rules.
    expect(WORLD_MISSIONS.length).toBe(6);
    expect(missionCounts(worldMap())).toEqual({ most: 24, guarded: 18 });
  });
  it("is done by holding the continents, the territories, or knocking out the player named", () => {
    const s = arranged(61, (s) => s.owner.fill(1), 3, true);
    s.mode = "missions";
    const [na, sa] = [s.map.continents[0], s.map.continents[1]];
    s.seats[0].mission = { kind: "continents", continents: [0, 1], extra: false };
    for (const t of [...na.territories, ...sa.territories.slice(1)]) s.owner[t] = 0;
    expect(missionDone(s, 0)).toBe(false);
    s.owner[sa.territories[0]] = 0;
    expect(missionDone(s, 0)).toBe(true);
    s.seats[0].mission = { kind: "continents", continents: [0, 1], extra: true };
    expect(missionDone(s, 0)).toBe(false);
    for (const t of s.map.continents[5].territories) s.owner[t] = 0;
    expect(missionDone(s, 0)).toBe(true);
    // 18 with two armies each.
    s.owner.fill(1);
    s.armies.fill(1);
    s.seats[0].mission = { kind: "territories", count: 18, armies: 2 };
    for (let t = 0; t < 18; t++) s.owner[t] = 0;
    expect(missionDone(s, 0)).toBe(false);
    for (let t = 0; t < 18; t++) s.armies[t] = 2;
    expect(missionDone(s, 0)).toBe(true);
    s.armies[3] = 1;
    expect(missionDone(s, 0)).toBe(false);
    s.seats[0].mission = { kind: "territories", count: 18, armies: 1 };
    expect(missionDone(s, 0)).toBe(true);
  });
  it("wins the moment the mover does it, and turns a knock-out done by another into 24 territories", () => {
    const s = arranged(
      62,
      (s) => {
        const [a, b] = pair(s);
        s.mode = "missions";
        s.owner.fill(2);
        s.owner[a] = 0;
        s.owner[b] = 1;
        s.armies[a] = 6;
        s.armies[b] = 1;
        s.phase = "attack";
        s.seats[0].mission = { kind: "destroy", target: 1 };
        s.seats[2].mission = { kind: "destroy", target: 1 };
      },
      3,
      true,
    );
    const [a, b] = pair(s),
      won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.phase).toBe("over");
    expect(won.end).toBe("mission");
    expect(won.winners).toEqual([0]);
    // Someone else's mission against the same player becomes 24 territories.
    const other = { ...s, seats: s.seats.map((seat, p) => ({ ...seat, mission: p === 0 ? ({ kind: "territories", count: 24, armies: 1 } as const) : seat.mission })) },
      took = play(other, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(took.phase).not.toBe("over");
    expect(took.seats[2].mission).toEqual({ kind: "territories", count: 24, armies: 1 });
    // Another's mission done in my turn does not end the game.
    const theirs = arranged(63, (x) => {
      x.mode = "missions";
      x.owner.fill(1);
      x.seats[1].mission = { kind: "territories", count: 10, armies: 1 };
      x.seats[0].mission = { kind: "territories", count: 40, armies: 1 };
      x.owner[0] = 0;
      x.owner[1] = 2;
      x.phase = "reinforce";
      x.reserve = 3;
    }, 3, true);
    expect(play(theirs, { type: "place", territory: 0, count: 3 }, Math.random)!.phase).toBe("attack");
  });
});

describe("winning", () => {
  it("세계 정복: taking the last territory wins", () => {
    const s = arranged(71, (s) => {
      const [a, b] = pair(s);
      s.owner.fill(0);
      s.owner[b] = 1;
      s.armies[a] = 4;
      s.armies[b] = 1;
      s.seats[2].alive = false;
      s.phase = "attack";
    });
    const [a, b] = pair(s),
      won = play(s, { type: "attack", from: a, to: b }, dice(6, 6, 6, 1))!;
    expect(won.phase).toBe("over");
    expect(won.winners).toEqual([0]);
    expect(won.end).toBe("conquest");
    expect(play(won, { type: "next" }, Math.random)).toBeNull();
  });
  it("수도 점령: holding every capital wins, and capitals are chosen when the setting up is done", () => {
    const random = seeded(72);
    let claimed = createGame({ players: 3, size: "small", mode: "capitals", world: true }, random);
    expect(claimed.seats.every((seat) => seat.capital < 0)).toBe(true);
    while (claimed.phase === "claim" || claimed.phase === "deploy") claimed = play(claimed, decide(claimed, "normal", random), random)!;
    expect(claimed.seats.every((seat, p) => seat.capital >= 0 && claimed.owner[seat.capital] === p)).toBe(true);
    const base = createGame({ players: 3, size: "small", mode: "capitals", start: "random" }, seeded(42)),
      capitals = base.seats.map((seat) => seat.capital);
    expect(capitals.every((t, p) => t >= 0 && base.owner[t] === p)).toBe(true);
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
    expect(won.seats[1].alive).toBe(true);
  });
  it("턴 제한: the most territories after the last round wins", () => {
    let s = createGame({ players: 3, size: "small", mode: "turns", rounds: 2, start: "random" }, seeded(43));
    s = { ...s, owner: s.owner.map((_, t) => (t < 11 ? 1 : t === 11 ? 2 : 0)) };
    for (let turns = 0; turns < 6; turns++) {
      s = play(s, { type: "place", territory: s.owner.indexOf(s.turn), count: s.reserve }, Math.random)!;
      s = play(play(s, { type: "next" }, Math.random)!, { type: "next" }, Math.random)!;
    }
    expect(s.phase).toBe("over");
    expect(s.end).toBe("turns");
    expect(s.winners).toEqual([1]);
    expect(s.round).toBe(2);
  });
  it("ends once no person is left at the screen", () => {
    const s = createGame({ players: 3, size: "small", mode: "conquest", people: 1, start: "random" }, seeded(44)),
      x: State = { ...s, owner: [...s.owner], armies: [...s.armies], seats: s.seats.map((seat) => ({ ...seat })), turn: 1, phase: "attack" };
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
  function selfPlay(seed: number, players: number, levels: Level[], mode: Mode = "conquest", world = true, size: Size = "small") {
    const random = seeded(seed);
    let s = createGame({ players, size, mode, world }, random),
      steps = 0,
      turns = 0;
    while (s.phase !== "over" && turns < 500) {
      const action: Action = decide(s, levels[s.turn % levels.length], random),
        next = play(s, action, random);
      expect(next, `${JSON.stringify(action)} in ${s.phase}`).not.toBeNull();
      if (next!.turn !== s.turn && next!.phase === "reinforce") turns++;
      s = next!;
      expect(++steps).toBeLessThan(30000);
    }
    return { s, turns };
  }
  it("claims, sets up and finishes a whole game against itself on the world map within bounds", () => {
    for (const [seed, players, levels] of [
      [1, 2, ["hard"]],
      [2, 3, ["normal", "hard"]],
      [3, 4, ["hard", "normal", "easy"]],
      [4, 6, ["hard"]],
    ] as [number, number, Level[]][]) {
      const { s, turns } = selfPlay(seed, players, levels);
      expect(s.phase, `seed ${seed}`).toBe("over");
      expect(turns).toBeLessThan(500);
      expect(s.winners.length).toBe(1);
      expect(alive(s)).toEqual(s.winners);
    }
  });
  it("plays missions, capitals and a generated world to their end too", () => {
    for (const [seed, players] of [
      [5, 3],
      [6, 5],
      [7, 2],
    ]) {
      const { s } = selfPlay(seed, players, ["hard", "normal"], "missions");
      expect(s.phase).toBe("over");
      expect(["mission", "conquest", "alone"]).toContain(s.end);
    }
    expect(selfPlay(8, 3, ["hard"], "capitals").s.phase).toBe("over");
    expect(selfPlay(9, 4, ["hard"], "conquest", false, "medium").s.phase).toBe("over");
  });
  it("blocks with the neutral army in a game for two", () => {
    const s = createGame({ players: 2, size: "small", mode: "conquest", world: true }, seeded(81)),
      t = play(s, { type: "place", territory: s.owner.indexOf(0), count: 2 }, Math.random)!;
    const choice = decide(t, "hard", seeded(1));
    expect(choice.type === "place" && t.owner[choice.territory]).toBe(2);
    // Next to the other player rather than next to me only.
    const n = choice.type === "place" ? choice.territory : -1;
    expect(t.map.territories[n].neighbours.some((x) => t.owner[x] === 1)).toBe(true);
  });
  it("takes a sure territory, trades the cards it must, and puts the card bonus on a front", () => {
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
      const mine = s.owner.flatMap((o, t) => (o === 0 ? [t] : []));
      s.seats[0].cards = [0, 1, 2, 0, 1].map((kind, i) => card(mine[i] ?? 200 + i, kind as Card["kind"], mine[i] ?? -1));
    });
    const trade = decide(forced, "easy", seeded(1));
    expect(trade.type).toBe("trade");
    expect(trade.type === "trade" && trade.bonus !== undefined && forced.owner[trade.bonus]).toBe(0);
    expect(play(forced, trade, Math.random)).not.toBeNull();
  });
  it("reads no card and no mission but its own", () => {
    const s = createGame({ players: 3, size: "small", mode: "missions", start: "random", world: true }, seeded(53));
    const hidden: State = {
      ...s,
      deck: [],
      seats: s.seats.map((seat, p) => (p === 0 ? seat : { ...seat, mission: { kind: "territories", count: 1, armies: 1 }, cards: seat.cards.map((c) => ({ ...c, kind: 0 as const })) })),
    };
    for (const level of ["easy", "normal", "hard"] as Level[]) expect(decide(hidden, level, seeded(9))).toEqual(decide(s, level, seeded(9)));
  });
});
