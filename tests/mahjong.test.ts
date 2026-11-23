import { describe, expect, it } from "vitest";
import * as R from "../src/games/mahjong/rules";
import { extent, tileAt } from "../src/games/mahjong/layout";

const pair = (from: number, to: number) => ({ from, to, extra: -1 });
const SHUFFLE = { from: -1, to: R.SHUFFLE, extra: -1 };
/** A board of the given slots and faces, every tile present. */
function board(slots: R.Slot[], faces: number[]): R.State {
  return { stage: 1, slots, faces, present: slots.map(() => 1), plan: [], last: null, shuffles: 0, winner: null, ply: 0 };
}
/** Whether the tiles present can all be taken, by a search over every order (small boards only). */
function clearable(s: R.State) {
  const t = R.touchOf(s.slots),
    left = [...s.present],
    dead = new Set<string>();
  const go = (): boolean => {
    if (left.every((p) => !p)) return true;
    const key = left.join("");
    if (dead.has(key)) return false;
    const free = left.flatMap((p, i) => (p && R.freeIn(t, left, i) ? [i] : []));
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++) {
        if (!R.matches(s.faces[free[i]], s.faces[free[j]])) continue;
        left[free[i]] = left[free[j]] = 0;
        if (go()) return true;
        left[free[i]] = left[free[j]] = 1;
      }
    dead.add(key);
    return false;
  };
  return go();
}
/** Plays the hint until the board is clear; every hint must be legal. */
function followHints(start: R.State) {
  let s = start;
  for (let k = 0; k < 200 && s.winner === null; k++) {
    const m = R.hint(s);
    expect(m, `a hint at ply ${s.ply}`).not.toBeNull();
    const next = R.play(s, m!);
    expect(next, `the hint ${m!.from}-${m!.to} is legal`).not.toBeNull();
    s = next!;
  }
  return s;
}

describe("the free tile rule", () => {
  // A row of three on the table, one tile on the middle one, and one tile a row nearer touching only the left end's half.
  const slots: R.Slot[] = [
    { x: 0, z: 0, layer: 0 },
    { x: 2, z: 0, layer: 0 },
    { x: 4, z: 0, layer: 0 },
    { x: 2, z: 0, layer: 1 },
    { x: 6, z: 1, layer: 0 },
  ];
  const s = board(slots, [0, 0, 1, 1, 2]);
  it("frees a tile with nothing on it and its left or its right side open", () => {
    expect([0, 1, 2, 3, 4].map((i) => R.isFree(s, i))).toEqual([true, false, false, true, true]);
  });
  it("counts a tile half a row over as touching the side, and anything on a tile as covering it", () => {
    // Slot 2 has slot 1 on its left and slot 4 (half a row nearer) on its right: both sides closed.
    expect(R.touchOf(slots).right[2]).toEqual([4]);
    expect(R.touchOf(slots).above[1]).toEqual([3]);
    // Take the end on the left: the middle one is open on the left but still covered.
    const open = { ...s, present: [0, 1, 1, 1, 1] };
    expect(R.isFree(open, 1)).toBe(false);
    expect(R.isFree({ ...open, present: [0, 1, 1, 0, 1] }, 1)).toBe(true);
    // Take the half-row tile away: slot 2 is open on the right.
    expect(R.isFree({ ...s, present: [1, 1, 1, 1, 0] }, 2)).toBe(true);
  });
  it("refuses a blocked tile with words, the cover before the sides", () => {
    expect(R.refusal(s, { from: -1, to: 1, extra: -1 })).toMatch(/^위에 다른 패/);
    expect(R.refusal(s, { from: -1, to: 2, extra: -1 })).toMatch(/^왼쪽과 오른쪽이 모두 막혀/);
    expect(R.play(s, pair(0, 1))).toBeNull();
    // A free tile whose partners are all blocked.
    expect(R.refusal(s, { from: -1, to: 4, extra: -1 })).toMatch(/짝이 되는 패가 아직/);
    expect(R.play(s, { from: -1, to: 4, extra: -1 })).toBeNull();
  });
  it("lists every free matching pair both ways round, and nothing else", () => {
    expect(R.freePairs(s)).toEqual([]);
    expect(R.stuck(s)).toBe(true);
    expect(R.moves(s)).toEqual([SHUFFLE]);
    const t = board(slots, [0, 5, 1, 0, 2]);
    expect(R.freePairs(t)).toEqual([[0, 3]]);
    expect(R.moves(t)).toEqual([pair(0, 3), pair(3, 0)]);
    expect([...R.pickable(t)].sort()).toEqual([0, 3]);
  });
});

describe("matching", () => {
  it("pairs a kind with itself only, any flower with any flower and any season with any season", () => {
    expect(R.matches(4, 4)).toBe(true);
    expect(R.matches(4, 5)).toBe(false);
    expect(R.matches(31, 31)).toBe(true);
    expect(R.matches(31, 32)).toBe(false);
    for (let a = 34; a < 38; a++) for (let b = 34; b < 38; b++) expect(R.matches(a, b)).toBe(true);
    for (let a = 38; a < 42; a++) for (let b = 38; b < 42; b++) expect(R.matches(a, b)).toBe(true);
    expect(R.matches(34, 38)).toBe(false);
    expect(R.matches(37, 41)).toBe(false);
  });
  it("takes a free flower pair, refuses a flower with a season, and wins when the board is clear", () => {
    const slots: R.Slot[] = [0, 2, 4, 6].map((x) => ({ x: x * 2, z: 0, layer: 0 }));
    const s = board(slots, [34, 38, 36, 41]);
    expect(R.play(s, pair(0, 1))).toBeNull();
    expect(R.refusal(s, pair(0, 1))).toMatch(/^짝이 아닙니다/);
    const a = R.play(s, pair(0, 2))!;
    expect(a.present).toEqual([0, 1, 0, 1]);
    expect(a.last).toEqual({ kind: "pair", a: 0, b: 2 });
    expect(a.winner).toBeNull();
    const b = R.play(a, pair(3, 1))!;
    expect(b.winner).toBe(0);
    expect(R.mahjong.reason(b)).toMatch(/^성공!/);
    expect(R.moves(b)).toEqual([]);
    expect(R.play(b, pair(0, 1))).toBeNull();
  });
});

describe("layouts", () => {
  it("are five, of rising size, even, ending with the whole set of 144 in five layers", () => {
    const sizes = R.STAGES.map((s) => s.slots.length);
    expect(sizes).toEqual([38, 72, 114, 140, 144]);
    for (let k = 1; k < sizes.length; k++) expect(sizes[k]).toBeGreaterThan(sizes[k - 1]);
    expect(Math.max(...R.STAGES[4].slots.map((s) => s.layer))).toBe(4);
  });
  it("have no tile in the air and no two tiles in one place", () => {
    for (const stage of R.STAGES) {
      const t = R.touchOf(stage.slots);
      stage.slots.forEach((s, i) => {
        if (s.layer) expect(t.below[i].length, `${stage.name} ${i}`).toBeGreaterThan(0);
      });
      const places = new Set(stage.slots.map((s) => `${s.x},${s.z},${s.layer}`));
      expect(places.size).toBe(stage.slots.length);
      for (let i = 0; i < stage.slots.length; i++)
        for (let j = i + 1; j < stage.slots.length; j++) {
          const a = stage.slots[i],
            b = stage.slots[j];
          expect(a.layer === b.layer && Math.abs(a.x - b.x) < 2 && Math.abs(a.z - b.z) < 2, `${stage.name} ${i} ${j} overlap`).toBe(false);
        }
    }
  });
  it("are laid round the middle of the table", () => {
    for (const stage of R.STAGES) {
      const xs = stage.slots.map((s) => tileAt(s).x);
      expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(0.6);
      expect(extent(stage.slots).x).toBeLessThan(11);
    }
  });
});

describe("deals", () => {
  it("can always be cleared: the way kept runs from the first pair to the last", () => {
    for (let stage = 1; stage <= 5; stage++)
      for (let seed = 1; seed <= 25; seed++) {
        const s = R.createGame(stage, R.quick(seed * 31 + stage));
        expect(s.present.every((p) => p === 1)).toBe(true);
        expect(s.plan.length).toBe(s.slots.length);
        expect(R.runs(s.slots, s.faces, s.present, s.plan), `stage ${stage} seed ${seed}`).toBe(true);
      }
  });
  it("deal tiles in matching sets: the tower holds the whole set, smaller layouts whole fours of kinds", () => {
    const full = R.createGame(5, R.quick(7));
    const count = (s: R.State) => s.faces.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map<number, number>());
    const all = count(full);
    for (let f = 0; f < 34; f++) expect(all.get(f)).toBe(4);
    for (let f = 34; f < 42; f++) expect(all.get(f)).toBe(1);
    for (let stage = 1; stage <= 4; stage++) {
      const s = R.createGame(stage, R.quick(stage)),
        groups = s.faces.reduce((m, f) => m.set(R.groupOf(f), (m.get(R.groupOf(f)) ?? 0) + 1), new Map<number, number>());
      for (const n of groups.values()) expect(n % 2).toBe(0);
      expect([...groups.values()].filter((n) => n !== 4).length).toBeLessThanOrEqual(1);
    }
  });
  it("draw one number from the random given, so that a browser test can lay the same deal", () => {
    let draws = 0;
    const counted = () => {
      draws++;
      return 0.42;
    };
    const a = R.createGame(3, counted);
    expect(draws).toBe(1);
    expect(R.createGame(3, () => 0.42).faces).toEqual(a.faces);
  });
  it("can also be cleared by the solver alone on the small layouts", () => {
    for (let seed = 1; seed <= 10; seed++)
      for (const stage of [1, 2]) {
        const s = R.createGame(stage, R.quick(seed));
        const way = R.solve({ ...s, plan: [] }, 200000, []);
        expect(way).not.toBeNull();
        expect(R.runs(s.slots, s.faces, s.present, way!)).toBe(true);
      }
  });
});

describe("the hint", () => {
  it("clears every layout when followed from the deal", () => {
    for (let stage = 1; stage <= 5; stage++) {
      const end = followHints(R.createGame(stage, R.quick(100 + stage)));
      expect(end.winner).toBe(0);
    }
  });
  it("shows a pair that keeps the board clearable, after pairs of my own that the way did not take", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const random = R.quick(seed * 13);
      let s = R.createGame(1, R.quick(seed));
      // Three pairs chosen at random among the free ones.
      for (let k = 0; k < 3; k++) {
        const pairs = R.freePairs(s);
        if (!pairs.length) break;
        const [a, b] = pairs[Math.floor(random() * pairs.length)];
        s = R.play(s, pair(a, b))!;
      }
      if (s.winner !== null || R.stuck(s)) continue;
      const can = clearable(s),
        m = R.hint(s);
      if (!can) {
        expect(m).toBeNull();
        continue;
      }
      checked++;
      expect(m).not.toBeNull();
      const next = R.play(s, m!)!;
      expect(next).not.toBeNull();
      expect(clearable(next), `seed ${seed}`).toBe(true);
      expect(followHints(next).winner).toBe(0);
    }
    expect(checked).toBeGreaterThan(10);
  });
  it("mends the way when I take a pair it did not: the way left still runs, or is found again", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = R.createGame(4, R.quick(seed)),
        plan = s.plan,
        pairs = R.freePairs(s).filter(([a, b]) => !(plan.indexOf(a) >> 1 === plan.indexOf(b) >> 1));
      if (!pairs.length) continue;
      const next = R.play(s, pair(...pairs[0]))!;
      if (next.plan.length) expect(R.runs(next.slots, next.faces, next.present, next.plan)).toBe(true);
    }
  });
  it("asks for 다시 섞기 when no pair is free", () => {
    const slots: R.Slot[] = [
      { x: 0, z: 0, layer: 0 },
      { x: 2, z: 0, layer: 0 },
      { x: 4, z: 0, layer: 0 },
      { x: 2, z: 0, layer: 1 },
    ];
    const s = board(slots, [0, 1, 2, 1]);
    expect(R.stuck(s)).toBe(true);
    expect(R.hint(s)).toEqual(SHUFFLE);
  });
});

describe("다시 섞기", () => {
  it("is refused while a pair is free", () => {
    const s = R.createGame(1, R.quick(3));
    expect(R.play(s, SHUFFLE)).toBeNull();
    expect(R.refusal(s, SHUFFLE)).toMatch(/아직 맞출 수 있는 짝/);
  });
  it("deals the tiles left again where they lie, so that they can be cleared", () => {
    let shuffled = 0;
    for (let seed = 1; seed <= 60 && shuffled < 12; seed++) {
      const random = R.quick(seed * 5 + 1);
      let s = R.createGame(seed % 2 ? 1 : 2, R.quick(seed));
      // Random pairs until the board is stuck.
      for (let k = 0; k < 80 && !R.stuck(s) && s.winner === null; k++) {
        const pairs = R.freePairs(s),
          [a, b] = pairs[Math.floor(random() * pairs.length)];
        s = R.play(s, pair(a, b))!;
      }
      if (!R.stuck(s)) continue;
      const next = R.play(s, SHUFFLE, random);
      if (!next) {
        // Only when the places left cannot be cleared in any order.
        expect(R.clearing(s.slots, s.present, R.quick(1), 1e6)).toBeNull();
        continue;
      }
      shuffled++;
      expect(next.present).toEqual(s.present);
      expect(next.last).toEqual({ kind: "shuffle" });
      expect(next.shuffles).toBe(1);
      const faces = (x: R.State) => x.faces.filter((_, i) => x.present[i]).sort((a, b) => a - b);
      expect(faces(next)).toEqual(faces(s));
      expect(R.runs(next.slots, next.faces, next.present, next.plan)).toBe(true);
      expect(followHints(next).winner).toBe(0);
    }
    expect(shuffled).toBeGreaterThan(5);
  });
  it("is refused when the places left cannot be cleared at all: two tiles one on the other", () => {
    const slots: R.Slot[] = [
      { x: 0, z: 0, layer: 0 },
      { x: 0, z: 0, layer: 1 },
    ];
    const s = board(slots, [3, 3]);
    expect(R.stuck(s)).toBe(true);
    expect(R.play(s, SHUFFLE)).toBeNull();
    expect(R.refusal(s, SHUFFLE)).toMatch(/섞을 수 없습니다/);
  });
});
