import { describe, expect, test } from "vitest";
import { HEXES, NEIGHBOURS, RING2, distance, hexOf } from "../src/games/hexconquest/board";
import { chooseMove, type Level } from "../src/games/hexconquest/ai";
import { CAPITAL, NONE, PORT, TOWN, fairness, generateMap, reachable, reaches, seeded, type Estate } from "../src/games/hexconquest/map";
import { END, MAX, createGame, destinations, hexConquest, moves, play, standing, type State } from "../src/games/hexconquest/rules";
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
    s: State = { map: { land, estate, corners }, owner, armies, nations, seat, left: 0, budget: 0, round: 1, ply: 0, winner: null, last: null };
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
    const towns = lay({ armies: { [H]: [0, 10, 10] }, estates: { [straight.via[0]]: TOWN, [bent.via[0]]: TOWN } });
    expect(targets(towns, H)).not.toContain(straight.to);
    expect(targets(towns, H)).toContain(bent.to);
    const blocked = lay({ armies: { [H]: [0, 10, 10], [bent.via[0]]: [1, 5, 5], [bent.via[1]]: [0, 5, 5] } });
    expect(targets(blocked, H)).not.toContain(bent.to);
    // Every neighbour with an estate: only the six single steps remain.
    const ringed = lay({ armies: { [H]: [0, 10, 10] }, estates: Object.fromEntries(NEIGHBOURS[H].map((n) => [n, TOWN])) });
    expect(targets(ringed, H)).toEqual([...NEIGHBOURS[H]].sort((a, b) => a - b));
  });
  test("ports lead onto the water and back; at sea a coast with an army is entered only at a port", () => {
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
    // At sea: water one or two steps, land next to it, but not a coast held by an army unless it is a port.
    const at = hexOf(10, 5),
      shore = NEIGHBOURS[at].filter(land);
    const afloat = lay({ land, armies: { [at]: [0, 10, 10] } });
    for (const n of NEIGHBOURS[at]) expect(targets(afloat, at)).toContain(n);
    expect(targets(afloat, at).filter(land)).toEqual([...shore].sort((a, b) => a - b));
    const guarded = lay({ land, armies: { [at]: [0, 10, 10], [shore[0]]: [1, 5, 5] } });
    expect(targets(guarded, at)).not.toContain(shore[0]);
    const harbour = lay({ land, estates: { [shore[0]]: PORT }, armies: { [at]: [0, 10, 10], [shore[0]]: [1, 5, 5] } });
    expect(targets(harbour, at)).toContain(shore[0]);
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
  test("a town gives +10 and +10, its loser −10; a port +5 and +5, its loser −5", () => {
    const town = taking(TOWN);
    expect(army(town, N0)).toEqual([30, 30]);
    expect(army(town, FAR0)).toEqual([40, 15]);
    expect(army(town, FAR1)).toEqual([30, 10]);
    expect(town.last!.captured).toBe("town");
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
    const kept = taking(null, { owner: { [N0]: 1, [FAR1]: 1, [ring[0]]: -1, [ring[1]]: -1 }, estates: { [ring[0]]: TOWN } });
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
  test("idle armies lose 1 morale; capitals give 5 and towns 5 + (plain + 5 × ports) ÷ towns", () => {
    const t1 = hexOf(6, 6),
      t2 = hexOf(6, 3),
      port = hexOf(8, 8),
      idle = hexOf(4, 4);
    // Ten plain hexes of mine, the idle army's among them.
    const plain = [idle, hexOf(3, 3), hexOf(3, 4), hexOf(3, 5), hexOf(4, 5), hexOf(5, 5), hexOf(5, 4), hexOf(4, 3), hexOf(2, 2), hexOf(2, 3)];
    const owner: Record<number, number> = { [t1]: 0, [t2]: 0, [port]: 0 };
    for (const h of plain) owner[h] = 0;
    let s = lay({ owner, estates: { [t1]: TOWN, [t2]: TOWN, [port]: PORT }, armies: { [C0]: [0, 10, 10], [idle]: [0, 20, 6], [C1]: [1, 5, 5] } });
    expect(standing(s, 0)).toMatchObject({ plain: 10, towns: 2, ports: 1, capitals: 1 });
    s = play(s, { from: -1, to: END, extra: -1 })!;
    expect(army(s, idle)).toEqual([20, 5]);
    expect(army(s, C0)).toEqual([15, 9]);
    // Average morale (9 + 5) ÷ 2 = 7; 5 + ⌊(10 + 5) ÷ 2⌋ = 12 men in each town.
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
      const s = createGame(k, () => 0.37);
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
      expect(new Set(fair.towns).size).toBe(1);
      const land = map.land.filter(Boolean).length,
        towns = map.estate.filter((e) => e === TOWN).length;
      expect(towns).toBeGreaterThanOrEqual(Math.floor(land / 14));
      expect(towns).toBeLessThanOrEqual(Math.ceil(land / 7));
      for (let h = 0; h < HEXES; h++) {
        if (map.estate[h] === TOWN) for (const n of NEIGHBOURS[h]) expect([TOWN, CAPITAL]).not.toContain(map.estate[n]);
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
      const s = lay({ seat: 1, all: 1, owner: { [N0]: -1 }, estates: { [N0]: TOWN }, armies: { [H]: [1, 20, 10], [C0]: [0, 10, 10] } });
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
    const s = createGame(2, () => 0.4);
    expect(hexConquestConfig.game.choose!(s, "normal", seeded(0.1))).toBeTruthy();
    expect(hexConquestConfig.tallyHtml!(s, "ai")[1]).toContain("청국");
    expect(hexConquestConfig.tallyHtml!(s, "ai")[1]).toContain("황국");
    expect(hexConquestConfig.tallyHtml!(s, "ai")[1]).not.toContain("흑국");
  });
});
