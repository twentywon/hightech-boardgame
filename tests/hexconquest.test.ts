import { describe, expect, test } from "vitest";
import { HEXES, NEIGHBOURS, RING2, distance, hexOf } from "../src/games/hexconquest/board";
import { chooseMove, type Level } from "../src/games/hexconquest/ai";
import { CAPITAL, CITY, NONE, PORT, VILLAGE, coastal, fairness, generateMap, reachable, reaches, seeded, type Estate } from "../src/games/hexconquest/map";
import {
  ACCEPT,
  END,
  MAX,
  NATION,
  NEW_MAP,
  PROPOSE,
  REFUSE,
  SPEECH,
  START,
  allied,
  canSpeak,
  createGame,
  destinations,
  dominates,
  hexConquest,
  moves,
  offerable,
  play,
  seatsFor,
  standing,
  type State,
} from "../src/games/hexconquest/rules";
import { CANNON_AT, TANK_AT, menFor, pieceFor } from "../src/games/hexconquest/layout";
import { hexConquestConfig } from "../src/games/hexconquest/config";

type Spec = {
  land?: (h: number) => boolean;
  estates?: Record<number, Estate>;
  /** Owners by hex; `all` is the owner of every other land hex. */
  owner?: Record<number, number>;
  all?: number;
  armies?: Record<number, [number, number, number]>;
  present?: number[];
  dead?: number[];
  seat?: number;
  me?: number;
  allies?: [number, number][];
};
/** The two capitals used unless a test says otherwise: far from the middle where the tests play. */
const C0 = hexOf(1, 9),
  C1 = hexOf(18, 1),
  C2 = hexOf(18, 9),
  C3 = hexOf(1, 1);
/** A board laid by hand: land everywhere (or where `land` says), capitals at the corners of the nations present. */
function lay(spec: Spec): State {
  const land = Array.from({ length: HEXES }, (_, h) => spec.land?.(h) ?? true),
    present = spec.present ?? [0, 1],
    corners = [C0, C1, C2, C3],
    estate: Estate[] = new Array(HEXES).fill(NONE);
  present.forEach((n) => (estate[corners[n]] = CAPITAL));
  for (const [h, e] of Object.entries(spec.estates ?? {})) estate[+h] = e;
  const owner = land.map((l) => (l ? (spec.all ?? -1) : -1));
  present.forEach((n) => (owner[corners[n]] = n));
  for (const [h, o] of Object.entries(spec.owner ?? {})) owner[+h] = o;
  const armies = new Array(HEXES).fill(null);
  for (const [h, [nation, count, morale]] of Object.entries(spec.armies ?? {})) armies[+h] = { nation, count, morale, moved: false };
  const nations = [0, 1, 2, 3].map((n) => ({ present: present.includes(n), alive: present.includes(n) && !spec.dead?.includes(n), capital: present.includes(n) ? corners[n] : -1 }));
  const seat = spec.seat ?? 0,
    map = { land, estate, corners },
    allies = [0, 0, 0, 0];
  for (const [a, b] of spec.allies ?? []) {
    allies[a] |= 1 << b;
    allies[b] |= 1 << a;
  }
  const s: State = {
    world: map,
    map,
    phase: "play",
    me: spec.me ?? 0,
    computers: present.length - 1,
    owner,
    armies,
    nations,
    allies,
    asked: 0,
    offers: 0,
    speeches: [false, false, false, false],
    speaking: -1,
    seat,
    left: 0,
    budget: 0,
    round: 1,
    ply: 0,
    winner: null,
    last: null,
  };
  s.budget = s.left = Math.min(5, standing(s, seat).armies);
  return s;
}
const go = (s: State, from: number, to: number) => {
  const next = play(s, { from, to, extra: -1 });
  expect(next, `move ${from} → ${to}`).not.toBeNull();
  return next!;
};
const targets = (s: State, h: number) => destinations(s, h).map((d) => d.to).sort((a, b) => a - b);
const H = hexOf(10, 5);
const [N0, N1, N2, N3] = NEIGHBOURS[H];
const army = (s: State, h: number) => s.armies[h] && [s.armies[h]!.count, s.armies[h]!.morale];
/** Somewhere far from the middle for bystanding armies. */
const FAR0 = hexOf(3, 8),
  FAR1 = hexOf(16, 2);

describe("hex conquest movement", () => {
  test("a land army goes one step, or two over plain empty land", () => {
    const s = lay({ armies: { [H]: [0, 10, 10] } });
    expect(targets(s, H)).toEqual([...NEIGHBOURS[H], ...RING2[H].map((r) => r.to)].sort((a, b) => a - b));
    // A town or an army between closes the two-step way where it is the only way.
    const straight = RING2[H].find((r) => r.via.length === 1)!,
      bent = RING2[H].find((r) => r.via.length === 2)!;
    const towns = lay({ armies: { [H]: [0, 10, 10] }, estates: { [straight.via[0]]: VILLAGE, [bent.via[0]]: VILLAGE } });
    expect(targets(towns, H)).not.toContain(straight.to);
    expect(targets(towns, H)).toContain(bent.to);
    const blocked = lay({ armies: { [H]: [0, 10, 10], [bent.via[0]]: [1, 5, 5], [bent.via[1]]: [0, 5, 5] } });
    expect(targets(blocked, H)).not.toContain(bent.to);
    // Every neighbour with an estate: only the six single steps remain.
    const ringed = lay({ armies: { [H]: [0, 10, 10] }, estates: Object.fromEntries(NEIGHBOURS[H].map((n) => [n, VILLAGE])) });
    expect(targets(ringed, H)).toEqual([...NEIGHBOURS[H]].sort((a, b) => a - b));
  });
  test("ports lead onto the water and back; at sea an army lands on any coast next to it", () => {
    const land = (h: number) => h % 20 < 10,
      coast = hexOf(9, 5),
      sea = NEIGHBOURS[coast].filter((n) => !land(n));
    const inland = lay({ land, armies: { [coast]: [0, 10, 10] } });
    expect(targets(inland, coast).some((h) => !land(h))).toBe(false);
    const port = lay({ land, estates: { [coast]: PORT }, armies: { [coast]: [0, 10, 10] } });
    const water = targets(port, coast).filter((h) => !land(h));
    for (const n of sea) expect(water).toContain(n);
    for (const r of RING2[coast]) if (!land(r.to) && r.via.some((v) => !land(v))) expect(water).toContain(r.to);
    // A ship on the only water between closes the two-step way over it.
    const straight = RING2[coast].find((r) => !land(r.to) && r.via.length === 1 && !land(r.via[0]))!;
    const ship = lay({ land, estates: { [coast]: PORT }, armies: { [coast]: [0, 10, 10], [straight.via[0]]: [1, 5, 5] } });
    expect(targets(ship, coast)).not.toContain(straight.to);
    // At sea: water one or two steps, and every land hex next to it, held by an army or not.
    const at = hexOf(10, 5),
      shore = NEIGHBOURS[at].filter(land);
    const afloat = lay({ land, armies: { [at]: [0, 10, 10] } });
    for (const n of NEIGHBOURS[at]) expect(targets(afloat, at)).toContain(n);
    for (const n of shore) expect(targets(afloat, at)).toContain(n);
    const guarded = lay({ land, armies: { [at]: [0, 10, 10], [shore[0]]: [1, 5, 5] } });
    expect(targets(guarded, at)).toContain(shore[0]);
  });
  test("joining adds the counts and weighs the morale; past 99 the rest stay behind", () => {
    let s = lay({ all: 0, armies: { [H]: [0, 20, 10], [N0]: [0, 30, 30] } });
    s = go(s, H, N0);
    expect(army(s, N0)).toEqual([50, 22]);
    expect(s.armies[H]).toBeNull();
    s = go(lay({ all: 0, armies: { [H]: [0, 60, 30], [N0]: [0, 50, 20], [FAR0]: [0, 10, 10] } }), H, N0);
    expect(army(s, N0)).toEqual([MAX, 24]);
    expect(army(s, H)).toEqual([11, 11]);
    expect(s.armies[H]!.moved).toBe(true);
    // An army of 99 cannot be joined.
    expect(targets(lay({ all: 0, armies: { [H]: [0, 5, 5], [N0]: [0, 99, 9] } }), H)).not.toContain(N0);
  });
});
describe("hex conquest battles", () => {
  test("a stronger attacker wins and moves in: 50/30 against 40/10 leaves 19/19, the defender's nation −4", () => {
    const s = go(lay({ all: 0, owner: { [N0]: 1, [FAR1]: 1 }, armies: { [H]: [0, 50, 30], [N0]: [1, 40, 10], [FAR1]: [1, 20, 20], [FAR0]: [0, 10, 5] } }), H, N0);
    expect(army(s, N0)).toEqual([19, 19]);
    expect(s.armies[N0]!.nation).toBe(0);
    expect(army(s, FAR1)).toEqual([20, 16]);
    // The plain hex taken: +1 on every army of mine.
    expect(army(s, FAR0)).toEqual([10, 6]);
    expect(s.owner[N0]).toBe(0);
    expect(s.last).toMatchObject({ kind: "attack", won: true });
  });
  test("an attacker not stronger is destroyed; the defender keeps what the formula leaves", () => {
    const s = go(lay({ all: 0, owner: { [N0]: 1 }, armies: { [H]: [0, 20, 10], [N0]: [1, 40, 10], [FAR0]: [0, 30, 20] } }), H, N0);
    expect(s.armies[H]).toBeNull();
    expect(army(s, N0)).toEqual([28, 10]);
    expect(army(s, FAR0)).toEqual([30, 18]);
    expect(s.owner[N0]).toBe(1);
    // Equal power: the defender holds, with at least one man.
    const even = go(lay({ all: 0, owner: { [N0]: 1 }, armies: { [H]: [0, 20, 10], [N0]: [1, 20, 10] } }), H, N0);
    expect(even.armies[H]).toBeNull();
    expect(army(even, N0)).toEqual([1, 1]);
  });
});
describe("hex conquest morale", () => {
  const taking = (estate: Estate | null, extra: Spec = {}) =>
    go(
      lay({
        all: 0,
        owner: { [N0]: 1, [FAR1]: 1 },
        estates: estate === null ? {} : { [N0]: estate },
        armies: { [H]: [0, 30, 10], [FAR0]: [0, 40, 5], [FAR1]: [1, 30, 20] },
        ...extra,
      }),
      H,
      N0,
    );
  test("a village gives +10 and +10, its loser −10; a port +5 and +5, its loser −5", () => {
    const town = taking(VILLAGE);
    expect(army(town, N0)).toEqual([30, 30]);
    expect(army(town, FAR0)).toEqual([40, 15]);
    expect(army(town, FAR1)).toEqual([30, 10]);
    expect(town.last!.captured).toBe("village");
    const port = taking(PORT);
    expect(army(port, N0)).toEqual([30, 20]);
    expect(army(port, FAR0)).toEqual([40, 10]);
    expect(army(port, FAR1)).toEqual([30, 15]);
  });
  test("plain land gives +1 on every army for each hex taken, the hexes round it included", () => {
    const one = taking(null);
    expect(army(one, N0)).toEqual([30, 11]);
    expect(army(one, FAR0)).toEqual([40, 6]);
    const ring = NEIGHBOURS[N0].filter((n) => n !== H).slice(0, 2);
    const three = taking(null, { owner: { [N0]: 1, [FAR1]: 1, [ring[0]]: -1, [ring[1]]: -1 } });
    expect(army(three, N0)).toEqual([30, 13]);
    expect(army(three, FAR0)).toEqual([40, 8]);
    for (const r of ring) expect(three.owner[r]).toBe(0);
    // Round a hex with an estate or an army the land is not taken.
    const kept = taking(null, { owner: { [N0]: 1, [FAR1]: 1, [ring[0]]: -1, [ring[1]]: -1 }, estates: { [ring[0]]: VILLAGE } });
    expect(kept.owner[ring[0]]).toBe(-1);
  });
  test("a capital held by another: +20 and +30, its holder −30; a nation's own capital conquers it", () => {
    // Nation 1 is out, and nation 2 holds its capital.
    const c2 = C1,
      next = NEIGHBOURS[c2][0];
    const held = go(
      lay({ present: [0, 1, 2], dead: [1], all: 0, owner: { [c2]: 2, [FAR1]: 2 }, armies: { [next]: [0, 80, 10], [FAR0]: [0, 60, 5], [FAR1]: [2, 60, 40] } }),
      next,
      c2,
    );
    expect(army(held, c2)).toEqual([80, 60]);
    expect(army(held, FAR0)).toEqual([60, 35]);
    expect(army(held, FAR1)).toEqual([60, 10]);
    expect(held.last!.captured).toBe("capital");
    // A nation's own capital: +30 and +50, the nation out, its land and armies gone to the conqueror.
    const near = NEIGHBOURS[C1][0];
    const won = go(lay({ all: 0, owner: { [FAR1]: 1, [hexOf(15, 3)]: 1 }, armies: { [near]: [0, 80, 10], [FAR0]: [0, 60, 5], [FAR1]: [1, 30, 20] } }), near, C1);
    expect(army(won, C1)).toEqual([80, 80]);
    expect(army(won, FAR0)).toEqual([60, 55]);
    expect(won.armies[FAR1]).toBeNull();
    expect(won.owner[FAR1]).toBe(0);
    expect(won.owner[hexOf(15, 3)]).toBe(0);
    expect(won.nations[1].alive).toBe(false);
    expect(won.winner).toBe(0);
    expect(won.last!.conquered).toBe(1);
  });
  test("morale never above count, and after a move never below a fiftieth of the nation's men", () => {
    const s = go(lay({ all: 0, armies: { [H]: [0, 90, 90], [FAR0]: [0, 60, 0] } }), H, N0);
    expect(army(s, FAR0)).toEqual([60, 3]);
    expect(army(s, N0)).toEqual([90, 90]);
  });
});
describe("hex conquest turns", () => {
  test("idle armies lose 1 morale; with s = ⌊(plain + 5 × ports) ÷ (villages + cities)⌋ a capital gives 15 + 2s, a village 5 + s", () => {
    const t1 = hexOf(6, 6),
      t2 = hexOf(6, 3),
      port = hexOf(8, 8),
      idle = hexOf(4, 4);
    // Ten plain hexes of mine, the idle army's among them.
    const plain = [idle, hexOf(3, 3), hexOf(3, 4), hexOf(3, 5), hexOf(4, 5), hexOf(5, 5), hexOf(5, 4), hexOf(4, 3), hexOf(2, 2), hexOf(2, 3)];
    const owner: Record<number, number> = { [t1]: 0, [t2]: 0, [port]: 0 };
    for (const h of plain) owner[h] = 0;
    let s = lay({ owner, estates: { [t1]: VILLAGE, [t2]: VILLAGE, [port]: PORT }, armies: { [C0]: [0, 10, 10], [idle]: [0, 20, 6], [C1]: [1, 5, 5] } });
    expect(standing(s, 0)).toMatchObject({ plain: 10, villages: 2, ports: 1, capitals: 1 });
    s = play(s, { from: -1, to: END, extra: -1 })!;
    expect(army(s, idle)).toEqual([20, 5]);
    // s = ⌊(10 + 5) ÷ 2⌋ = 7: the capital 15 + 14 = 29 men onto its 10.
    expect(army(s, C0)).toEqual([39, 9]);
    // Average morale (9 + 5) ÷ 2 = 7; 5 + 7 = 12 men in each village.
    expect(army(s, t1)).toEqual([12, 7]);
    expect(army(s, t2)).toEqual([12, 7]);
    expect(s.seat).toBe(1);
    expect(s.last!.spawned).toEqual(expect.arrayContaining([C0, t1, t2]));
  });
  test("a turn has at most five moves, one for each army, and passes on by itself", () => {
    const spots = [hexOf(4, 2), hexOf(6, 2), hexOf(8, 2), hexOf(10, 2), hexOf(12, 2), hexOf(4, 8), hexOf(8, 8)];
    let s = lay({ all: 0, armies: { ...Object.fromEntries(spots.map((h) => [h, [0, 10, 10] as [number, number, number]])), [C1]: [1, 5, 5] } });
    expect(s.budget).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(s.seat).toBe(0);
      const move = moves(s).find((m) => m.from >= 0 && !s.armies[m.to])!;
      // The army that moved cannot move again this turn.
      s = go(s, move.from, move.to);
      if (i < 4) expect(moves(s).some((m) => m.from === move.to)).toBe(false);
    }
    expect(s.seat).toBe(1);
    expect(s.budget).toBe(1);
    // With fewer armies than five, a turn has as many moves as armies.
    expect(lay({ armies: { [H]: [0, 10, 10], [FAR0]: [0, 10, 10] } }).budget).toBe(2);
  });
  test("I lose when my capital is taken; a nation that held a fallen capital gives it back with 99/99", () => {
    const near = NEIGHBOURS[C0][0];
    const lost = go(lay({ all: 1, owner: { [C0]: 0 }, seat: 1, armies: { [near]: [1, 30, 10], [FAR0]: [0, 5, 5] } }), near, C0);
    expect(lost.winner).toBe(1);
    expect(hexConquest.reason(lost)).toMatch(/^청국이 홍국의 수도를 점령했습니다\./);
    // Nation 2 is out; nation 1 holds its capital. I take nation 1's: nation 2 comes back.
    const by = NEIGHBOURS[C1][0];
    const back = go(lay({ present: [0, 1, 2], dead: [2], all: 0, owner: { [C2]: 1 }, armies: { [by]: [0, 60, 30] } }), by, C1);
    expect(back.nations[2].alive).toBe(true);
    expect(back.owner[C2]).toBe(2);
    expect(army(back, C2)).toEqual([99, 99]);
    expect(back.winner).toBeNull();
    expect(back.last!.restored).toEqual([2]);
  });
  test("a new game: four corners, one army of 10/10 each, the land round each capital its own", () => {
    for (const k of [1, 2, 3]) {
      const s = play(createGame(k, () => 0.37), { from: -1, to: START, extra: -1 })!;
      const present = s.nations.filter((n) => n.present).length;
      expect(present).toBe(k + 1);
      s.nations.forEach((n, i) => {
        if (!n.present) return expect(s.map.estate.filter((e) => e === CAPITAL).length).toBe(present);
        expect(army(s, n.capital)).toEqual([10, 10]);
        for (const m of NEIGHBOURS[n.capital]) if (s.map.land[m] && s.map.estate[m] === NONE) expect(s.owner[m]).toBe(i);
      });
      expect(s.seat).toBe(0);
    }
    // The same number gives the same map.
    expect(createGame(3, () => 0.5).map).toEqual(createGame(3, () => 0.5).map);
    expect(createGame(3, () => 0.5).phase).toBe("setup");
  });
});
describe("hex conquest maps", () => {
  test("over many seeds: capitals on land, every estate within reach, fair shares, towns apart, ports on coasts, quick", () => {
    let worst = 0,
      total = 0;
    for (let i = 0; i < 120; i++) {
      const t = performance.now(),
        map = generateMap(seeded((i + 0.5) / 120));
      const spent = performance.now() - t;
      worst = Math.max(worst, spent);
      total += spent;
      for (const c of map.corners) expect(map.land[c]).toBe(true);
      for (const c of map.corners) {
        const seen = reachable(map, c);
        for (let h = 0; h < HEXES; h++) if (map.estate[h] !== NONE) expect(seen[h]).toBe(true);
        for (const d of map.corners) expect(seen[d]).toBe(true);
      }
      const fair = fairness(map);
      expect(fair.ratio).toBeGreaterThanOrEqual(0.72);
      expect(new Set(fair.villages).size).toBe(1);
      expect(new Set(fair.cities).size).toBe(1);
      const land = map.land.filter(Boolean).length,
        towns = map.estate.filter((e) => e === VILLAGE).length,
        cities = map.estate.filter((e) => e === CITY).length;
      expect(towns).toBeGreaterThanOrEqual(Math.floor(land / 14));
      expect(towns).toBeLessThanOrEqual(Math.ceil(land / 7));
      // Fewer cities than villages: one for every three or four, at least one a corner.
      expect(cities).toBeGreaterThanOrEqual(4);
      expect(cities * 3).toBeLessThanOrEqual(towns);
      for (let h = 0; h < HEXES; h++) {
        if (map.estate[h] === VILLAGE || map.estate[h] === CITY) for (const n of NEIGHBOURS[h]) expect([VILLAGE, CITY, CAPITAL]).not.toContain(map.estate[n]);
        if (map.estate[h] === PORT) expect(NEIGHBOURS[h].some((n) => !map.land[n])).toBe(true);
      }
      expect(reaches(map.corners).length).toBe(HEXES);
    }
    expect(total / 120).toBeLessThan(60);
    expect(worst).toBeLessThan(250);
  });
  test("distance counts steps on the grid of offset columns", () => {
    for (let h = 0; h < HEXES; h++) for (const n of NEIGHBOURS[h]) expect(distance(h, n)).toBe(1);
    expect(NEIGHBOURS[H]).toHaveLength(6);
    expect(RING2[H]).toHaveLength(12);
  });
});
describe("hex conquest computer", () => {
  test("plays only legal moves, and quickly", () => {
    let s = createGame(3, () => 0.21);
    const random = seeded(0.7);
    let worst = 0;
    for (let i = 0; i < 160 && s.winner === null; i++) {
      const level: Level = (["easy", "normal", "hard"] as const)[i % 3],
        t = performance.now(),
        move = chooseMove(s, level, random);
      worst = Math.max(worst, performance.now() - t);
      const next = play(s, move);
      expect(next).not.toBeNull();
      s = next!;
    }
    expect(worst).toBeLessThan(80);
  });
  test("takes an undefended town next to it", () => {
    for (const level of ["normal", "hard"] as Level[]) {
      const s = lay({ seat: 1, all: 1, owner: { [N0]: -1 }, estates: { [N0]: VILLAGE }, armies: { [H]: [1, 20, 10], [C0]: [0, 10, 10] } });
      expect(chooseMove(s, level, seeded(0.3))).toEqual({ from: H, to: N0, extra: -1 });
    }
  });
  test("hard beats easy", () => {
    let wins = 0;
    for (const seed of [0.1, 0.3]) {
      let s = createGame(1, () => seed);
      const random = seeded(seed + 0.5);
      while (s.winner === null && s.round <= 120) s = play(s, chooseMove(s, s.seat === 0 ? "hard" : "easy", random))!;
      if (s.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(1);
  }, 60000);
  test("the screen's choose is the computer's, and the tally tells every nation", () => {
    // Two computers with me on 홍국 (lower left): the diagonal 황국 and 흑국 across the width; 청국's corner is empty.
    const s = createGame(2, () => 0.4);
    expect(hexConquestConfig.game.choose!(s, "normal", seeded(0.1))).toBeTruthy();
    expect(hexConquestConfig.tallyHtml!(s, "ai")[0]).toContain("홍국 (나)");
    expect(hexConquestConfig.tallyHtml!(s, "ai")[1]).toContain("황국");
    expect(hexConquestConfig.tallyHtml!(s, "ai")[1]).toContain("흑국");
    expect(hexConquestConfig.tallyHtml!(s, "ai")[1]).not.toContain("청국");
  });
});
const tool = (to: number) => ({ from: -1, to, extra: -1 });
describe("hex conquest setup", () => {
  test("다른 맵 draws another map, an empire is chosen by its tool or its capital, nothing moves before 시작", () => {
    const s = createGame(3, () => 0.31);
    expect(s.phase).toBe("setup");
    expect(hexConquest.turn(s)).toBe(0);
    // No army moves in setup.
    expect(play(s, { from: s.map.corners[0], to: NEIGHBOURS[s.map.corners[0]][0], extra: -1 })).toBeNull();
    expect(play(s, tool(END))).toBeNull();
    expect(moves(s).every((m) => m.from === -1)).toBe(true);
    // Another map, from the random given to play (the same number lays the same map again).
    const other = play(s, tool(NEW_MAP), () => 0.77)!;
    expect(other.map.land).not.toEqual(s.map.land);
    expect(play(s, tool(NEW_MAP), () => 0.77)!.world).toEqual(other.world);
    expect(other.phase).toBe("setup");
    // 청국 by its tool, 흑국 by a tap on its capital.
    const blue = play(other, tool(NATION + 1))!;
    expect(blue.me).toBe(1);
    const black = play(other, tool(other.world.corners[3]))!;
    expect(black.me).toBe(3);
    expect(hexConquest.turn(black)).toBe(0);
    expect(hexConquest.owners(black)[black.world.corners[3]]).toBe(0);
    // 시작: play begins with the first nation present in the order of play.
    const started = play(black, tool(START))!;
    expect(started.phase).toBe("play");
    expect(started.seat).toBe(0);
    expect(hexConquest.turn(started)).toBe(1);
  });
  test("computers sit on the corners farthest from mine: the diagonal, then across the width", () => {
    expect(seatsFor(0, 1)).toEqual([0, 2]);
    expect(seatsFor(0, 2)).toEqual([0, 2, 3]);
    expect(seatsFor(1, 1)).toEqual([1, 3]);
    expect(seatsFor(1, 2)).toEqual([1, 2, 3]);
    expect(seatsFor(2, 2)).toEqual([0, 1, 2]);
    expect(seatsFor(3, 2)).toEqual([0, 1, 3]);
    expect(seatsFor(2, 3)).toEqual([0, 1, 2, 3]);
    // As played: an unused corner is plain land without a capital, shown so in setup.
    const s = play(createGame(1, () => 0.42), tool(NATION + 1))!;
    expect(s.nations.map((n) => n.present)).toEqual([false, true, false, true]);
    expect(s.map.estate[s.world.corners[0]]).toBe(NONE);
    expect(s.world.estate[s.world.corners[0]]).toBe(CAPITAL);
    expect(s.map.estate[s.world.corners[3]]).toBe(CAPITAL);
    expect(army(s, s.world.corners[1])).toEqual([10, 10]);
    const started = play(s, tool(START))!;
    expect(started.seat).toBe(1);
    expect(hexConquest.turn(started)).toBe(0);
    expect(hexConquest.hint(s)).toBe("맵과 제국을 고르고 시작을 누르세요.");
    expect(hexConquestConfig.tallyHtml!(s, "ai")[0]).toContain("청국 (나)");
  });
  test("whoever I chose: I win when the others are out and lose with my capital", () => {
    const near = NEIGHBOURS[C1][0];
    const won = go(lay({ me: 2, seat: 2, all: 2, owner: { [C1]: 1 }, present: [1, 2], armies: { [near]: [2, 80, 10] } }), near, C1);
    expect(won.winner).toBe(0);
    expect(hexConquest.reason(won)).toMatch(/^모든 나라를 정복했습니다\. 세계가 황국의/);
    const lost = go(lay({ me: 2, seat: 1, all: 1, owner: { [C2]: 2 }, present: [1, 2], armies: { [NEIGHBOURS[C2][0]]: [1, 80, 10] } }), NEIGHBOURS[C2][0], C2);
    expect(lost.winner).toBe(1);
    expect(hexConquest.reason(lost)).toMatch(/^청국이 황국의 수도를 점령했습니다\./);
  });
});
describe("hex conquest estates", () => {
  test("a city gives +15 and +15 and costs its holder 15; a city raises 10 + 2s, a village 5 + s, a capital 15 + 2s", () => {
    const s = go(
      lay({ all: 0, owner: { [N0]: 1, [FAR1]: 1 }, estates: { [N0]: CITY }, armies: { [H]: [0, 30, 10], [FAR0]: [0, 40, 5], [FAR1]: [1, 30, 20] } }),
      H,
      N0,
    );
    expect(army(s, N0)).toEqual([30, 30]);
    expect(army(s, FAR0)).toEqual([40, 20]);
    expect(army(s, FAR1)).toEqual([30, 5]);
    expect(s.last!.captured).toBe("city");
    // Two villages, a city, two ports and eleven plain hexes: s = ⌊(11 + 10) ÷ 3⌋ = 7.
    const v1 = hexOf(6, 6),
      v2 = hexOf(6, 3),
      city = hexOf(9, 3),
      p1 = hexOf(8, 8),
      p2 = hexOf(12, 8),
      plain = [hexOf(3, 3), hexOf(3, 4), hexOf(3, 5), hexOf(4, 5), hexOf(5, 5), hexOf(5, 4), hexOf(4, 3), hexOf(2, 2), hexOf(2, 3), hexOf(4, 4), hexOf(2, 4)];
    const owner: Record<number, number> = { [v1]: 0, [v2]: 0, [city]: 0, [p1]: 0, [p2]: 0 };
    for (const h of plain) owner[h] = 0;
    const t = lay({ owner, estates: { [v1]: VILLAGE, [v2]: VILLAGE, [city]: CITY, [p1]: PORT, [p2]: PORT }, armies: { [C0]: [0, 10, 10], [C1]: [1, 5, 5] } });
    expect(standing(t, 0)).toMatchObject({ plain: 11, villages: 2, cities: 1, ports: 2, capitals: 1 });
    const after = play(t, tool(END))!;
    expect(army(after, C0)![0]).toBe(10 + 15 + 14);
    expect(army(after, city)![0]).toBe(10 + 14);
    expect(army(after, v1)![0]).toBe(5 + 7);
    expect(army(after, v2)![0]).toBe(5 + 7);
    expect(after.armies[p1]).toBeNull();
    // A capital alone (no village, no city): s = 0, and it still gives the most, 15.
    const alone = play(lay({ armies: { [C0]: [0, 10, 10], [C1]: [1, 5, 5] }, owner: { [hexOf(2, 8)]: 0 } }), tool(END))!;
    expect(army(alone, C0)![0]).toBe(25);
  });
});
describe("hex conquest landings", () => {
  const land = (h: number) => h % 20 < 10,
    at = hexOf(10, 5),
    shore = NEIGHBOURS[at].filter(land);
  test("a ship lands onto a village, a port or a capital next to it, or two steps away beyond empty water", () => {
    for (const estate of [VILLAGE, CITY, PORT] as Estate[]) {
      const s = go(lay({ land, estates: { [shore[0]]: estate }, owner: { [shore[0]]: 1 }, armies: { [at]: [0, 20, 10], [FAR0]: [0, 5, 5] } }), at, shore[0]);
      expect(s.armies[shore[0]]!.nation).toBe(0);
      expect(s.owner[shore[0]]).toBe(0);
    }
    // Two steps: a water hex between, empty; a ship on it closes that way.
    const far = hexOf(11, 5),
      beyond = RING2[far].find((r) => land(r.to) && r.via.every((v) => !land(v)))!;
    expect(targets(lay({ land, armies: { [far]: [0, 10, 10] } }), far)).toContain(beyond.to);
    const blocked = lay({ land, armies: { [far]: [0, 10, 10], ...Object.fromEntries(beyond.via.map((v) => [v, [1, 5, 5]])) } });
    expect(targets(blocked, far)).not.toContain(beyond.to);
  });
  test("a landing onto an army attacks it: won, the ship stands ashore; lost, it is gone", () => {
    const won = go(lay({ land, all: 1, estates: { [shore[0]]: VILLAGE }, armies: { [at]: [0, 50, 30], [shore[0]]: [1, 20, 10], [FAR1]: [1, 5, 5] } }), at, shore[0]);
    expect(won.last).toMatchObject({ kind: "attack", won: true });
    expect(won.armies[shore[0]]!.nation).toBe(0);
    expect(won.armies[at]).toBeNull();
    expect(won.owner[shore[0]]).toBe(0);
    const lost = go(lay({ land, all: 1, armies: { [at]: [0, 10, 5], [shore[0]]: [1, 30, 10] } }), at, shore[0]);
    expect(lost.armies[at]).toBeNull();
    expect(lost.armies[shore[0]]!.nation).toBe(1);
    // And onto my own army ashore it joins it.
    const joined = go(lay({ land, armies: { [at]: [0, 10, 10], [shore[0]]: [0, 10, 10] } }), at, shore[0]);
    expect(army(joined, shore[0])![0]).toBe(20);
    expect(joined.last!.kind).toBe("join");
  });
});
describe("hex conquest pieces", () => {
  test("infantry under 40 men, a cannon under 70, a tank from 70; a ship at sea", () => {
    expect([1, 39, CANNON_AT, 69, TANK_AT, 99].map((c) => pieceFor(c))).toEqual(["infantry", "infantry", "cannon", "cannon", "tank", "tank"]);
    expect(pieceFor(80, true)).toBe("ship");
    expect([1, 14, 15, 29, 30, 39].map(menFor)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
describe("hex conquest ports", () => {
  test("over many seeds: about one port for every five to seven coastal hexes, two a corner with a coast, never side by side", () => {
    let ports = 0,
      shore = 0,
      corners = 0,
      twoOrMore = 0;
    for (let i = 0; i < 100; i++) {
      const map = generateMap(seeded((i + 0.25) / 100)),
        coast = coastal(map.land),
        reach = reaches(map.corners);
      ports += map.estate.filter((e) => e === PORT).length;
      shore += coast.filter(Boolean).length;
      for (let r = 0; r < 4; r++) {
        let c = 0,
          p = 0;
        for (let h = 0; h < HEXES; h++) {
          if (reach[h] !== r) continue;
          if (coast[h]) c++;
          if (map.estate[h] === PORT) p++;
        }
        if (c >= 6) {
          corners++;
          if (p >= 2) twoOrMore++;
        }
      }
      for (let h = 0; h < HEXES; h++) if (map.estate[h] === PORT) for (const n of NEIGHBOURS[h]) expect(map.estate[n]).not.toBe(PORT);
    }
    expect(shore / ports).toBeGreaterThanOrEqual(5);
    expect(shore / ports).toBeLessThanOrEqual(7);
    expect(twoOrMore / corners).toBeGreaterThan(0.95);
  });
});
describe("hex conquest alliances", () => {
  /** Three nations, 청국 strong enough to dominate or not. */
  const three = (blue: number, extra: Spec = {}) =>
    lay({ present: [0, 1, 2], armies: { [C0]: [0, 30, 20], [C1]: [1, blue, blue], [C2]: [2, 30, 20], [FAR0]: [0, 5, 5] }, ...extra });
  test("a computer accepts unless it dominates the field (1.3 × the next, or more than 40% of all)", () => {
    const weak = three(25);
    expect(dominates(weak, 1)).toBe(false);
    const asking = play(weak, tool(PROPOSE))!;
    expect(asking.phase).toBe("propose");
    expect(asking.left).toBe(weak.left);
    const s = play(asking, tool(NATION + 1))!;
    expect(allied(s, 0, 1)).toBe(true);
    expect(s.last!.pact).toEqual({ from: 0, to: 1, accepted: true });
    expect(hexConquestConfig.cheer!(asking, s, "ai")).toBe("청국: 동맹 수락");
    expect(s.left).toBe(weak.left);
    // Once a turn to the same nation; 황국 is still open, by a tap on its capital.
    expect(offerable(s)).toEqual([2]);
    const strong = three(80);
    expect(dominates(strong, 1)).toBe(true);
    const asked = play(strong, tool(PROPOSE))!,
      refused = play(asked, tool(strong.nations[1].capital))!;
    expect(allied(refused, 0, 1)).toBe(false);
    expect(refused.last!.pact!.accepted).toBe(false);
    expect(hexConquestConfig.cheer!(asked, refused, "ai")).toBe("청국: 동맹 거절");
    expect(play(refused, tool(NATION + 1))).toBeNull();
    // With two nations left no alliance is offered.
    expect(offerable(lay({ armies: { [C0]: [0, 10, 10], [C1]: [1, 10, 10] } }))).toEqual([]);
  });
  test("allies' borders hold, and entering an ally's land or attacking its army ends the alliance", () => {
    const ring = NEIGHBOURS[N0].filter((n) => n !== H);
    const spec: Spec = { present: [0, 1, 2], allies: [[0, 1]], owner: { [ring[0]]: 1, [ring[1]]: 2 }, armies: { [H]: [0, 30, 10], [FAR1]: [1, 20, 20], [C2]: [2, 10, 10] } };
    const s = go(lay(spec), H, N0);
    expect(s.owner[ring[0]]).toBe(1);
    expect(s.owner[ring[1]]).toBe(0);
    expect(allied(s, 0, 1)).toBe(true);
    // Onto the ally's land: the alliance ends first, and the land is taken.
    const broke = go(lay(spec), H, ring[0]);
    expect(allied(broke, 0, 1)).toBe(false);
    expect(broke.last!.broken).toBe(1);
    expect(broke.owner[ring[0]]).toBe(0);
    expect(hexConquestConfig.cheer!(lay(spec), broke, "ai")).toBe("홍국·청국 동맹 해제");
    // Attacking the ally's army ends it too.
    const attacked = go(lay({ ...spec, armies: { [H]: [0, 30, 10], [N0]: [1, 5, 5], [C2]: [2, 10, 10] } }), H, N0);
    expect(attacked.last!.kind).toBe("attack");
    expect(allied(attacked, 0, 1)).toBe(false);
  });
  test("the computer never attacks an ally, even a weak one beside it", () => {
    for (const level of ["normal", "hard"] as Level[]) {
      const s = lay({ present: [0, 1, 2], seat: 1, all: 1, allies: [[0, 1]], owner: { [N0]: 0 }, estates: { [N0]: VILLAGE }, armies: { [H]: [1, 40, 30], [N0]: [0, 2, 1], [C0]: [0, 10, 10], [C2]: [2, 10, 10] } });
      for (let i = 0; i < 6; i++) {
        const move = chooseMove(s, level, seeded(0.1 + i / 10));
        expect(move.to === N0 && move.from === H).toBe(false);
      }
    }
  });
  test("when every nation standing is allied with every other, every alliance ends", () => {
    const s = lay({ present: [0, 1, 2], allies: [[0, 1], [1, 2]], armies: { [C0]: [0, 30, 20], [C1]: [1, 30, 20], [C2]: [2, 30, 20] } });
    const asking = play(s, tool(PROPOSE))!,
      after = play(asking, tool(NATION + 2))!;
    expect(after.allies).toEqual([0, 0, 0, 0]);
    expect(after.last!.dissolved).toBe(true);
    expect(hexConquestConfig.cheer!(asking, after, "ai")).toBe("동맹이 모두 풀렸습니다");
  });
  test("a computer's offer to me waits for my turn: 수락 or 거절 first", () => {
    let s = lay({ present: [0, 1, 2], seat: 1, armies: { [C0]: [0, 30, 20], [C1]: [1, 30, 20], [C2]: [2, 30, 20] } });
    s = play(s, tool(NATION + 0))!;
    expect(s.offers).toBe(1 << 1);
    expect(hexConquestConfig.cheer!(s, s, "ai")).toBeNull();
    s = play(s, tool(END))!;
    s = play(s, tool(END))!;
    expect(s.seat).toBe(0);
    expect(s.phase).toBe("offer");
    expect(moves(s)).toEqual([tool(ACCEPT), tool(REFUSE)]);
    expect(hexConquest.hint(s)).toMatch(/^청국이 동맹을 제안했습니다/);
    const yes = play(s, tool(ACCEPT))!;
    expect(allied(yes, 0, 1)).toBe(true);
    expect(yes.phase).toBe("play");
    expect(hexConquestConfig.cheer!(s, yes, "ai")).toBe("청국과 동맹!");
    const no = play(s, tool(REFUSE))!;
    expect(allied(no, 0, 1)).toBe(false);
    expect(no.phase).toBe("play");
  });
  test("a weaker computer offers an alliance to a stronger neighbour now and then", () => {
    let offered = 0;
    for (let i = 0; i < 20; i++) {
      const s = lay({ present: [0, 1, 2], seat: 2, all: 2, owner: { [C0]: 0, [C1]: 1, [hexOf(15, 1)]: 1, [hexOf(16, 1)]: 1 }, armies: { [C0]: [0, 30, 20], [C1]: [1, 30, 20], [C2]: [2, 12, 10], [hexOf(17, 2)]: [2, 5, 5] } });
      const move = chooseMove(s, "normal", seeded(i / 20 + 0.01));
      if (move.to === NATION + 1 || move.to === NATION + 0) offered++;
    }
    expect(offered).toBeGreaterThan(0);
    expect(offered).toBeLessThan(20);
  });
});
describe("hex conquest speeches", () => {
  test("once a game, while morale is below half the men: full morale for the turn, the old morale back after", () => {
    const high = lay({ armies: { [H]: [0, 40, 30], [C1]: [1, 10, 10] } });
    expect(canSpeak(high)).toBe(false);
    expect(play(high, tool(SPEECH))).toBeNull();
    const X = NEIGHBOURS[FAR0][1],
      low = lay({ all: 0, armies: { [H]: [0, 40, 10], [FAR0]: [0, 20, 6], [X]: [0, 30, 4], [C1]: [1, 10, 10] } });
    expect(canSpeak(low)).toBe(true);
    let s = play(low, tool(SPEECH))!;
    expect(s.left).toBe(low.left);
    expect(army(s, H)).toEqual([40, 40]);
    expect(army(s, FAR0)).toEqual([20, 20]);
    expect(hexConquestConfig.cheer!(low, s, "ai")).toBe("연설!");
    expect(canSpeak(s)).toBe(false);
    expect(moves(s).some((m) => m.to === SPEECH)).toBe(false);
    // Joined: the remembered values weighted by count, ⌊(40·10 + 20·6) ÷ 60⌋ = 8.
    s = go(s, FAR0, NEIGHBOURS[FAR0][0]);
    s = go(s, H, N0);
    s = play(s, tool(END))!;
    // The army that moved: back to 10 (+0). The one left still: back to 4, then −1.
    expect(army(s, N0)).toEqual([40, 10]);
    expect(army(s, X)).toEqual([30, 3]);
    expect(s.speaking).toBe(-1);
    expect(s.armies.some((a) => a?.rally !== undefined)).toBe(false);
    const joined = go(play(low, tool(SPEECH))!, FAR0, X);
    expect(joined.armies[X]!.rally).toBe(Math.floor((20 * 6 + 30 * 4) / 50));
  });
  test("the computer speaks when full morale would win a battle it would lose", () => {
    const s = lay({ seat: 1, all: 1, owner: { [N0]: 0 }, estates: { [N0]: VILLAGE }, armies: { [H]: [1, 40, 5], [N0]: [0, 30, 20], [FAR1]: [1, 40, 5], [C0]: [0, 10, 10] } });
    expect(canSpeak(s)).toBe(true);
    expect(chooseMove(s, "normal", seeded(0.5))).toEqual(tool(SPEECH));
    // With full morale (80 against 50) the village is taken in that turn.
    let after = play(s, tool(SPEECH))!;
    const random = seeded(0.5);
    let struck = false;
    while (after.seat === 1 && after.winner === null) {
      const move = chooseMove(after, "hard", random);
      if (move.from === H && move.to === N0) struck = true;
      after = play(after, move)!;
    }
    expect(struck).toBe(true);
  });
});
