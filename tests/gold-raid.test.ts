import { describe, expect, test } from "vitest";
import * as R from "../src/games/goldraid/rules";
import * as S from "../src/games/goldraid/sim";

const hands = (a: Partial<S.Input> = {}, b: Partial<S.Input> = {}): [S.Input, S.Input] => [
  { ...S.IDLE, ...a },
  { ...S.IDLE, ...b },
];
/** A quiet valley: nothing falls and no cart comes unless a test lays it there. */
function quiet(target = 100, seconds = 0) {
  const w = S.createWorld(7, target, seconds);
  w.nextDrop = w.nextCart = 1e9;
  return w;
}
/** Steps `w` for `seconds`, `input` giving both hands each slice; everything that happened. */
function run(w: S.World, seconds: number, input: (w: S.World, k: number) => [S.Input, S.Input] = () => hands(), until: (e: S.Happening) => boolean = () => false) {
  const seen: S.Happening[] = [];
  for (let k = 0; k < seconds / S.DT; k++)
    for (const e of S.step(w, input(w, k))) {
      seen.push(e);
      if (until(e)) return seen;
    }
  return seen;
}
const lay = (w: S.World, kind: S.LootKind, x: number, y = 0.12, value = S.KINDS[kind].value): S.Loot => {
  const item: S.Loot = { id: w.nextId++, kind, value, x, y, vx: 0, vy: 0, rest: true, age: 0, free: 0 };
  w.loot.push(item);
  return item;
};

describe("gold raid: running and jumping", () => {
  test("a bandit runs up to its speed, stops when let go, and is kept within the valley", () => {
    const w = quiet();
    run(w, 1, () => hands({ x: 1 }));
    const b = w.bandits[0];
    expect(b.vx).toBeCloseTo(S.RUN, 3);
    expect(b.face).toBe(1);
    run(w, 0.5);
    expect(b.vx).toBe(0);
    run(w, 6, () => hands({ x: 1 }));
    expect(b.x).toBe(S.X_MOST);
    run(w, 8, () => hands({ x: -1 }));
    expect(b.x).toBe(-S.X_MOST);
    expect(b.face).toBe(-1);
  });
  test("a jump rises under gravity and comes down on the road; only from the ground (or a moment after an edge)", () => {
    const w = quiet(),
      b = w.bandits[0];
    let top = 0,
      jumps = 0;
    run(w, 1.2, (_, k) => {
      top = Math.max(top, b.y);
      return hands({ jump: k === 0 || k === 20 });
    }).forEach((e) => e.kind === "jump" && jumps++);
    expect(jumps).toBe(1);
    expect(top).toBeCloseTo((S.JUMP * S.JUMP) / (2 * S.G), 1);
    expect(b.y).toBe(0);
    expect(b.ground).toBe(true);
    // Pressed a moment before landing, it jumps again as it lands.
    let early = false;
    const again = run(w, 1.2, (w2, k) => {
      const me = w2.bandits[0],
        now = !early && !me.ground && me.vy < 0 && me.y < 0.5;
      if (now) early = true;
      return hands({ jump: k === 0 || now });
    });
    expect(early).toBe(true);
    expect(again.filter((e) => e.kind === "jump")).toHaveLength(2);
  });
  test("a ledge is passed through from below and stood on from above; walking off its end, the bandit falls", () => {
    const w = quiet(),
      b = w.bandits[0],
      ledge = S.PLATFORMS[2];
    b.x = 0;
    run(w, 1.2, (_, k) => hands({ jump: k === 0 }));
    expect(b.y).toBe(ledge.y);
    expect(b.ground).toBe(true);
    // And from there onto the high ledge over it.
    run(w, 1.2, (_, k) => hands({ jump: k === 0 }));
    expect(b.y).toBe(S.PLATFORMS[5].y);
    // Off its end and the middle ledge's: down to the road.
    run(w, 3, () => hands({ x: 1 }));
    expect(b.y).toBe(0);
    expect(b.x).toBeGreaterThan(ledge.x1);
    expect(S.surfaceUnder(0, 10)).toBe(S.PLATFORMS[5].y);
    expect(S.surfaceUnder(0, 2)).toBe(ledge.y);
    expect(S.surfaceUnder(9, 10)).toBe(0);
  });
});

describe("gold raid: loot, the sack and the gate", () => {
  test("loot falls, lands on the ledge or the road under it, lies a while and is gone", () => {
    const w = quiet();
    w.loot.push({ id: 1, kind: "coin", value: 1, x: 0, y: S.DROP_FROM, vx: 0, vy: 0, rest: false, age: 0, free: 0 });
    w.loot.push({ id: 2, kind: "gem", value: 5, x: 8.5, y: S.DROP_FROM, vx: 0, vy: 0, rest: false, age: 0, free: 0 });
    w.bandits[0].x = -3.5;
    w.bandits[1].x = 3;
    run(w, 4);
    expect(w.loot.map((i) => [i.rest, +i.y.toFixed(2)])).toEqual([
      [true, 3.32],
      [true, 0.12],
    ]);
    run(w, S.LOOT_LIFE + 0.1);
    expect(w.loot).toEqual([]);
  });
  test("loot is taken by touching it, where it lies or in the air; the sack holds only so much and slows its bearer", () => {
    const w = quiet(),
      b = w.bandits[0];
    lay(w, "pouch", b.x + 1.5);
    lay(w, "chest", b.x + 3);
    const seen = run(w, 1, () => hands({ x: 1 }));
    expect(seen.filter((e) => e.kind === "pickup")).toMatchObject([
      { side: 0, value: 3, what: "pouch" },
      { side: 0, value: 12, what: "chest" },
    ]);
    expect(b.carry).toBe(15);
    expect(w.loot).toEqual([]);
    // A chest for a sack with room for five: five are taken and the rest stays in it.
    const chest = lay(w, "chest", b.x + 1);
    run(w, 0.5, () => hands({ x: 1 }));
    expect(b.carry).toBe(S.CAP);
    expect(chest.value).toBe(7);
    expect(w.loot).toContain(chest);
    // Full, it runs slower.
    run(w, 0.5, () => hands({ x: -1 }));
    expect(Math.abs(b.vx)).toBeCloseTo(S.RUN * (1 - S.LOAD_SLOW), 3);
    // In the air: a coin over its head is caught by a jump.
    const v = quiet(),
      c = v.bandits[0];
    v.loot.push({ id: 9, kind: "coin", value: 1, x: c.x, y: 2.6, vx: 0, vy: 0, rest: true, age: 0, free: 0 });
    run(v, 0.2);
    expect(c.carry).toBe(0);
    run(v, 0.6, (_, k) => hands({ jump: k === 0 }));
    expect(c.carry).toBe(1);
  });
  test("gold counts only once it is brought to one's own gate: there the sack is emptied into the treasury", () => {
    const w = quiet(),
      [a, b] = w.bandits;
    a.carry = 9;
    // Before the other's gate nothing is deposited.
    a.x = S.gateOf(1);
    b.x = 0;
    expect(run(w, 0.3).some((e) => e.kind === "deposit")).toBe(false);
    expect(w.treasury).toEqual([0, 0]);
    // Run home: deposited on arrival, once.
    const seen = run(w, 6, () => hands({ x: -1 }));
    expect(seen.filter((e) => e.kind === "deposit")).toEqual([{ kind: "deposit", side: 0, amount: 9 }]);
    expect(w.treasury).toEqual([9, 0]);
    expect(a.carry).toBe(0);
    // Not from the air over the gate.
    const v = quiet(),
      c = v.bandits[0];
    c.x = S.gateOf(0);
    c.y = 2;
    c.ground = false;
    c.carry = 4;
    while (c.y > 0.3) expect(S.step(v, hands()).some((e) => e.kind === "deposit")).toBe(false);
    run(v, 0.2);
    expect(v.treasury[0]).toBe(4);
  });
});

describe("gold raid: the club, bombs, the cart and the gates", () => {
  /** Side 0 one step from side 1, facing it, in the middle of the road. */
  function facing() {
    const w = quiet(),
      [a, b] = w.bandits;
    [a.x, b.x] = [0, 0.9];
    a.face = 1;
    return w;
  }
  test("a blow makes the other drop part of its sack and stuns it a moment; it cannot be struck again at once", () => {
    const w = facing(),
      [a, b] = w.bandits;
    b.carry = 10;
    const seen = run(w, 0.2, (_, k) => hands({ strike: k === 0 }));
    expect(seen.find((e) => e.kind === "hit")).toEqual({ kind: "hit", by: 0, on: 1, dropped: 4 });
    expect(b.carry).toBe(6);
    expect(b.stun).toBeGreaterThan(0.5);
    // The dropped gold flies out as loot worth what was dropped.
    expect(w.loot.reduce((sum, i) => sum + i.value, 0)).toBe(4);
    // Stunned, its hands do nothing.
    const x = b.x;
    run(w, 0.3, () => hands({}, { x: -1, jump: true, strike: true }));
    expect(b.face).toBe(-1);
    expect(b.swing).toBe(-1);
    void x;
    // Struck again while still safe: nothing.
    a.x = b.x - 0.8;
    a.cool = 0;
    a.swing = -1;
    expect(run(w, 0.3, (_, k) => hands({ strike: k === 0 })).some((e) => e.kind === "hit")).toBe(false);
    // Out of reach, or behind my back: a swing and no blow.
    const far = facing();
    far.bandits[1].x = 2.5;
    expect(run(far, 0.3, (_, k) => hands({ strike: k === 0 })).map((e) => e.kind)).toEqual(["swing"]);
    const behind = facing();
    behind.bandits[0].face = -1;
    expect(run(behind, 0.3, (_, k) => hands({ strike: k === 0 })).map((e) => e.kind)).toEqual(["swing"]);
    // The club must rest before the next swing.
    const quick = facing();
    expect(run(quick, S.COOL - 0.05, () => hands({ strike: true })).filter((e) => e.kind === "swing")).toHaveLength(1);
  });
  test("a bomb touched goes off; one that lies goes off when its fuse has burnt: whoever is near is stunned and loses half its sack", () => {
    const w = quiet(),
      [a, b] = w.bandits;
    a.carry = 8;
    b.x = 9;
    lay(w, "bomb", a.x + 1);
    const seen = run(w, 0.5, () => hands({ x: 1 }));
    expect(seen.find((e) => e.kind === "boom")).toMatchObject({ stunned: [0] });
    expect(a.carry).toBe(4);
    expect(a.stun).toBeGreaterThan(0.8);
    // Lying alone it burns down, and the bandit standing clear of its blast is untouched.
    const v = quiet(),
      c = v.bandits[0];
    c.carry = 6;
    lay(v, "bomb", c.x + S.BLAST + 0.6);
    const later = run(v, S.FUSE + 0.1);
    expect(later.find((e) => e.kind === "boom")).toMatchObject({ stunned: [] });
    expect(c.carry).toBe(6);
    expect(v.loot).toEqual([]);
  });
  test("the merchant's cart comes in its time, sheds gold at each blow and breaks open at the last", () => {
    const w = S.createWorld(3);
    w.nextDrop = 1e9;
    w.bandits[1].x = 10;
    const came = run(w, S.CART.first + 0.1, undefined, (e) => e.kind === "cart");
    expect(came.at(-1)?.kind).toBe("cart");
    const cart = w.cart!,
      a = w.bandits[0];
    expect(cart.gold).toBe(S.CART.gold);
    // Stood before it, striking as fast as the club allows.
    const seen: S.Happening[] = [];
    for (let k = 0; k < 20 / S.DT && w.cart && w.cart.broken < 0; k++) {
      a.x = cart.x - cart.dir * 1.2;
      a.face = cart.dir;
      a.carry = 0;
      seen.push(...S.step(w, hands({ strike: true })));
    }
    expect(seen.filter((e) => e.kind === "shed")).toHaveLength(S.CART.blows - 1);
    expect(seen.filter((e) => e.kind === "shed").every((e) => e.kind === "shed" && e.amount === S.CART.shed)).toBe(true);
    expect(seen.filter((e) => e.kind === "broken")).toHaveLength(1);
    expect(cart.gold).toBe(0);
    // All its gold is out on the road, or was caught by the striker as it flew.
    const caught = seen.reduce((sum, e) => sum + (e.kind === "pickup" ? e.value : 0), 0);
    expect(w.loot.reduce((sum, i) => sum + i.value, 0) + caught).toBe(S.CART.gold);
    // The wreck is cleared and another cart comes later, from the other side.
    run(w, 3);
    expect(w.cart).toBeNull();
    const next = run(w, S.CART.every[1] + 1, undefined, (e) => e.kind === "cart").at(-1);
    expect(next).toEqual({ kind: "cart", dir: -cart.dir });
    // Left alone, a cart crosses the valley and is gone with its gold.
    const alone = S.createWorld(3);
    alone.nextDrop = 1e9;
    alone.bandits[0].x = alone.bandits[1].x = 0;
    alone.bandits[0].y = alone.bandits[1].y = S.PLATFORMS[2].y;
    run(alone, S.CART.first + 0.2);
    expect(alone.cart).not.toBeNull();
    run(alone, (2 * (S.X_MOST + 2.4)) / S.CART.pace + 1);
    expect(alone.cart).toBeNull();
  });
  test("a blow on the other's gate takes a little of its treasury out before it, the castle drops a fire pot, and the gate is shut a while", () => {
    const w = quiet(),
      [a, b] = w.bandits;
    w.treasury = [0, 10];
    b.x = -5;
    a.x = S.gateOf(1) - 0.3;
    a.face = 1;
    const seen = run(w, 0.2, (_, k) => hands({ strike: k === 0 }));
    expect(seen.find((e) => e.kind === "raid")).toEqual({ kind: "raid", by: 0, amount: S.RAID });
    expect(w.treasury).toEqual([0, 10 - S.RAID]);
    expect(w.loot.filter((i) => i.kind !== "bomb").reduce((sum, i) => sum + i.value, 0)).toBe(S.RAID);
    expect(w.loot.some((i) => i.pot)).toBe(true);
    // Stood there, the raider is caught by the pot.
    const boom = run(w, 2, undefined, (e) => e.kind === "boom").at(-1);
    expect(boom).toMatchObject({ kind: "boom", stunned: [0] });
    // The gate is shut against the next blow for a while; an empty treasury gives nothing.
    const again = quiet();
    again.treasury = [0, 1];
    again.bandits[1].x = -5;
    again.bandits[0].x = S.gateOf(1) - 0.3;
    const first = run(again, 0.2, (_, k) => hands({ strike: k === 0 }));
    expect(first.find((e) => e.kind === "raid")).toMatchObject({ amount: 1 });
    again.bandits[0].cool = 0;
    again.bandits[0].swing = -1;
    again.locked[1] = 0;
    again.loot = [];
    expect(run(again, 0.2, (_, k) => hands({ strike: k === 0 })).some((e) => e.kind === "raid")).toBe(false);
    // My own gate is not robbed by me.
    const own = quiet();
    own.treasury = [5, 0];
    own.bandits[0].x = S.gateOf(0) + 0.3;
    own.bandits[0].face = -1;
    expect(run(own, 0.2, (_, k) => hands({ strike: k === 0 })).some((e) => e.kind === "raid")).toBe(false);
  });
});

describe("gold raid: the match", () => {
  test("the first castle filled wins, and nothing moves after", () => {
    const w = quiet(20),
      a = w.bandits[0];
    w.treasury = [15, 19];
    a.carry = 5;
    const seen = run(w, 3, () => hands({ x: -1 }));
    expect(seen.slice(-2)).toEqual([
      { kind: "deposit", side: 0, amount: 5 },
      { kind: "win", side: 0 },
    ]);
    expect(w.over).toBe(true);
    const tick = w.tick;
    expect(S.step(w, hands({ x: 1 }))).toEqual([]);
    expect(w.tick).toBe(tick);
  });
  test("with a clock the match ends when it runs out", () => {
    const w = quiet(R.TIMED_ROOM, 3);
    expect(S.timeLeft(w)).toBeCloseTo(3, 5);
    const seen = run(w, 4);
    expect(seen).toEqual([{ kind: "time" }]);
    expect(S.timeLeft(w)).toBe(0);
    expect(w.over).toBe(true);
    expect(S.timeLeft(quiet())).toBeNull();
  });
  test("loot falls in mirrored pairs, of every kind, a chest only now and then", () => {
    const w = S.createWorld(11);
    w.nextCart = 1e9;
    w.bandits[0].y = w.bandits[1].y = 50;
    const drops = run(w, 240).filter((e): e is Extract<S.Happening, { kind: "drop" }> => e.kind === "drop");
    expect(drops.length).toBeGreaterThan(180);
    for (let k = 0; k + 1 < drops.length; k += 2) {
      expect(drops[k + 1].what).toBe(drops[k].what);
      expect(drops[k + 1].x).toBeCloseTo(-drops[k].x, 9);
    }
    const count = (what: S.LootKind) => drops.filter((d) => d.what === what).length;
    for (const kind of Object.keys(S.KINDS) as S.LootKind[]) expect(count(kind), kind).toBeGreaterThan(0);
    expect(count("coin")).toBeGreaterThan(count("pouch"));
    expect(count("chest")).toBeLessThan(count("gem") + 6);
    expect(Math.max(...drops.map((d) => Math.abs(d.x)))).toBeLessThanOrEqual(S.DROP_REACH);
  });
  test("the computer plays a whole match at every level: it brings gold home and a castle is filled; the better level wins more", () => {
    const play = (a: S.Level, b: S.Level, seed: number) => {
      const w = S.createWorld(seed, 60),
        seen: Record<string, number> = {};
      for (let k = 0; k < 500 / S.DT && !w.over; k++) for (const e of S.step(w, [S.think(w, 0, a), S.think(w, 1, b)])) seen[e.kind] = (seen[e.kind] ?? 0) + 1;
      return { w, seen };
    };
    for (const level of ["easy", "normal", "hard"] as const) {
      const { w, seen } = play(level, level, 41);
      expect(w.over, level).toBe(true);
      expect(Math.max(...w.treasury), level).toBeGreaterThanOrEqual(60);
      expect(Math.min(...w.treasury), level).toBeGreaterThan(5);
      expect(seen.deposit, level).toBeGreaterThan(6);
      expect(seen.pickup, level).toBeGreaterThan(20);
      expect(w.bandits.every((b) => Math.abs(b.x) <= S.X_MOST && b.y >= 0 && b.carry >= 0 && b.carry <= S.CAP)).toBe(true);
    }
    let hard = 0;
    for (let seed = 1; seed <= 6; seed++) {
      if (play("easy", "hard", seed * 97).w.treasury[1] >= 60) hard++;
      if (play("hard", "easy", seed * 97).w.treasury[0] >= 60) hard++;
    }
    expect(hard).toBeGreaterThanOrEqual(10);
  });
  test("the same seed and the same hands play the same match", () => {
    const play = () => {
      const w = S.createWorld(2024, 40),
        log: string[] = [];
      for (let k = 0; k < 60 / S.DT && !w.over; k++) for (const e of S.step(w, [S.think(w, 0, "hard"), S.think(w, 1, "normal")])) log.push(JSON.stringify(e));
      return { log, treasury: w.treasury, bandits: JSON.stringify(w.bandits), seed: w.seed };
    };
    const a = play();
    expect(a.log.length).toBeGreaterThan(30);
    expect(play()).toEqual(a);
  });
});

describe("gold raid: the rules", () => {
  test("deposits add up to the first full castle; a robbery takes from a castle; other moves are refused", () => {
    let s = R.createGame("60");
    expect(s).toMatchObject({ target: 60, seconds: 0, gold: [0, 0], winner: null });
    s = R.play(s, R.depositMove(0, 20))!;
    s = R.play(s, R.depositMove(1, 7))!;
    expect(s.gold).toEqual([20, 7]);
    expect(s.last).toEqual({ side: 1, amount: 7, raid: false });
    s = R.play(s, R.raidedMove(1, 2))!;
    expect(s.gold).toEqual([20, 5]);
    expect(s.raided).toEqual([0, 1]);
    // More than a sack holds, more than a blow takes, more than the castle has, nothing: refused.
    expect(R.play(s, R.depositMove(0, S.CAP + 1))).toBeNull();
    expect(R.play(s, R.depositMove(0, 0))).toBeNull();
    expect(R.play(s, R.raidedMove(0, S.RAID + 1))).toBeNull();
    expect(R.play(R.createGame("60"), R.raidedMove(0, 1))).toBeNull();
    expect(R.play(s, { from: -1, to: R.TIME, extra: -1 })).toBeNull();
    expect(R.play(s, { from: 0, to: 105, extra: -1 })).toBeNull();
    s = R.play(s, R.depositMove(0, 20))!;
    expect(s.winner).toBeNull();
    s = R.play(s, R.depositMove(0, 20))!;
    expect(s.winner).toBe(0);
    expect(R.moves(s)).toEqual([]);
    expect(R.play(s, R.depositMove(1, 5))).toBeNull();
    expect(R.goldRaid.reason(s)).toContain("60닢");
    // Every move the valley can report is among the legal ones.
    const open = R.play(R.createGame("100"), R.depositMove(1, 3))!;
    for (const m of [R.depositMove(0, 1), R.depositMove(1, S.CAP), R.raidedMove(1, 2)]) expect(R.moves(open)).toContainEqual(m);
    expect(R.createGame("nonsense").target).toBe(100);
  });
  test("with a clock the fuller castle wins when it runs out, and alike they draw", () => {
    let s = R.createGame(R.TIMED);
    expect(s.seconds).toBe(R.TIMED_SECONDS);
    for (let k = 0; k < 12; k++) s = R.play(s, R.depositMove(1, 20))!;
    expect(s.winner).toBeNull();
    s = R.play(s, R.depositMove(0, 4))!;
    const end = R.play(s, { from: -1, to: R.TIME, extra: -1 })!;
    expect(end.winner).toBe(1);
    expect(R.play(R.createGame(R.TIMED), { from: -1, to: R.TIME, extra: -1 })!.winner).toBe("draw");
    expect(R.goldRaid.reason(end)).toContain("4 대 240");
  });
});
