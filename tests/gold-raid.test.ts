import { describe, expect, test } from "vitest";
import * as L from "../src/games/goldraid/layout";
import * as R from "../src/games/goldraid/rules";
import * as S from "../src/games/goldraid/sim";
import * as H from "../src/games/goldraid/hands";

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
    run(w, 20, () => hands({ x: 1 }));
    expect(b.x).toBe(S.X_MOST);
    run(w, 20, () => hands({ x: -1 }));
    expect(b.x).toBe(-S.X_MOST);
    expect(b.face).toBe(-1);
  });
  test("a jump rises under gravity and comes down on the road; only from the ground (or a moment after an edge)", () => {
    const w = quiet(),
      b = w.bandits[0];
    let top = 0,
      jumps = 0;
    run(w, 1.6, (_, k) => {
      top = Math.max(top, b.y);
      return hands({ jump: k === 0 || k === 20 });
    }).forEach((e) => e.kind === "jump" && jumps++);
    expect(jumps).toBe(1);
    expect(top).toBeCloseTo((S.JUMP * S.JUMP) / (2 * S.G), 1);
    expect(b.y).toBe(0);
    expect(b.ground).toBe(true);
    // Pressed a moment before landing, it jumps again as it lands.
    let early = false;
    const again = run(w, 3, (w2, k) => {
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
      [ledge, high] = S.PLATFORMS;
    b.x = 0;
    run(w, 1.2, (_, k) => hands({ jump: k === 0 }));
    expect(b.y).toBe(ledge.y);
    expect(b.ground).toBe(true);
    // And from there onto the high ledge over it.
    run(w, 1.2, (_, k) => hands({ jump: k === 0 }));
    expect(b.y).toBe(high.y);
    // Off its end and the middle ledge's: down to the road.
    run(w, 3, () => hands({ x: 1 }));
    expect(b.y).toBe(0);
    expect(b.x).toBeGreaterThan(ledge.x1);
    expect(S.surfaceUnder(0, 10)).toBe(high.y);
    expect(S.surfaceUnder(0, 2)).toBe(ledge.y);
    expect(S.surfaceUnder(7.4, 10)).toBe(0);
  });
});

describe("gold raid: loot, the sack and the gate", () => {
  test("loot falls, lands on the ledge or the road under it, lies a while and is gone", () => {
    const w = quiet();
    w.loot.push({ id: 1, kind: "coin", value: 1, x: 0, y: S.DROP_FROM, vx: 0, vy: 0, rest: false, age: 0, free: 0 });
    w.loot.push({ id: 2, kind: "gem", value: 5, x: 7.4, y: S.DROP_FROM, vx: 0, vy: 0, rest: false, age: 0, free: 0 });
    w.bandits[0].x = -3.5;
    w.bandits[1].x = 3;
    run(w, 5);
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
    lay(w, "gem", b.x + 3);
    const seen = run(w, 1.5, () => hands({ x: 1 }));
    expect(seen.filter((e) => e.kind === "pickup")).toMatchObject([
      { side: 0, value: 10, what: "pouch" },
      { side: 0, value: 5, what: "gem" },
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
    const seen = run(w, 24, () => hands({ x: -1 }));
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
  test("a blow makes the other drop all its sack and stuns it a moment; it cannot be struck again at once", () => {
    const w = facing(),
      [a, b] = w.bandits;
    b.carry = 10;
    const seen = run(w, 0.2, (_, k) => hands({ strike: k === 0 }));
    expect(seen.find((e) => e.kind === "hit")).toEqual({ kind: "hit", by: 0, on: 1, dropped: 10 });
    expect(b.carry).toBe(0);
    expect(b.stun).toBeGreaterThan(0.5);
    // The dropped gold flies out as loot worth what was dropped.
    expect(w.loot.reduce((sum, i) => sum + i.value, 0)).toBe(10);
    // Stunned, its hands do nothing.
    const x = b.x;
    run(w, 0.3, () => hands({}, { x: -1, jump: true, strike: true }));
    expect(b.face).toBe(-1);
    expect(b.swing).toBe(-1);
    void x;
    // The striker's club waits a little longer than the stun.
    expect(S.HIT_COOL).toBeGreaterThan(S.STUN);
    // Struck again while still down: nothing.
    a.x = b.x - 0.8;
    a.face = 1;
    a.cool = 0;
    a.swing = -1;
    expect(b.stun).toBeGreaterThan(0);
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
  test("the merchant's cart comes in its time, sheds 10 gold every third or fourth blow and breaks open with its last", () => {
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
    // Three or four blows to each 10, the last 10 breaking it open: 30 gold in 9 to 12 blows.
    const sheds = seen.filter((e) => e.kind === "shed"),
      paid = sheds.filter((e) => e.kind === "shed" && e.amount > 0),
      blows = sheds.length + 1;
    expect(paid).toHaveLength(S.CART.gold / S.CART.shed - 1);
    expect(paid.every((e) => e.kind === "shed" && e.amount === S.CART.shed)).toBe(true);
    expect(blows).toBeGreaterThanOrEqual(9);
    expect(blows).toBeLessThanOrEqual(12);
    // Between two payouts two or three blows only rock it.
    let since = 0;
    for (const e of sheds) {
      if (e.kind === "shed" && e.amount > 0) {
        expect(since + 1).toBeGreaterThanOrEqual(3);
        expect(since + 1).toBeLessThanOrEqual(4);
        since = 0;
      } else since++;
    }
    expect(seen.filter((e) => e.kind === "broken")).toHaveLength(1);
    expect(cart.gold).toBe(0);
    // All its gold is out on the road, or was caught by the striker as it flew.
    const caught = seen.reduce((sum, e) => sum + (e.kind === "pickup" ? e.value : 0), 0);
    expect(w.loot.reduce((sum, i) => sum + i.value, 0) + caught).toBe(S.CART.gold);
    // The wreck is cleared and another cart comes later, from the other side.
    run(w, 4.5);
    expect(w.cart).toBeNull();
    const next = run(w, S.CART.every[1] + 1, undefined, (e) => e.kind === "cart").at(-1);
    // Every cart of a match comes from the same end (the user asked for one side only).
    expect(next).toEqual({ kind: "cart", dir: cart.dir });
    // Left alone, a cart crosses the valley and is gone with its gold.
    const alone = S.createWorld(3);
    alone.nextDrop = 1e9;
    alone.bandits[0].x = alone.bandits[1].x = 0;
    alone.bandits[0].y = alone.bandits[1].y = S.PLATFORMS[0].y;
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
  test("only pouches (and bombs) fall from the sky, in mirrored pairs, less often than before; spilled gold is pouches too", () => {
    const w = S.createWorld(11);
    w.nextCart = 1e9;
    w.bandits[0].y = w.bandits[1].y = 50;
    const drops = run(w, 720).filter((e): e is Extract<S.Happening, { kind: "drop" }> => e.kind === "drop");
    // Seldom now (the user asked): one every 5 to 9 s.
    expect(drops.length).toBeGreaterThan(720 / 9);
    expect(drops.length).toBeLessThan(720 / 5);
    for (let k = 0; k + 1 < drops.length; k += 2) {
      expect(drops[k + 1].what).toBe(drops[k].what);
      expect(drops[k + 1].x).toBeCloseTo(-drops[k].x, 9);
    }
    const count = (what: S.LootKind) => drops.filter((d) => d.what === what).length;
    for (const kind of ["coin", "gem", "chest"] as const) expect(count(kind), kind).toBe(0);
    expect(count("pouch")).toBeGreaterThan(2 * count("bomb"));
    expect(count("bomb")).toBeGreaterThan(0);
    // Gold thrown out is pouches of 10, the last holding what is left.
    const spilt = S.createWorld(3);
    spilt.loot = [];
    S.spill(spilt, 8, 0, 1);
    expect(spilt.loot.map((i) => [i.kind, i.value])).toEqual([["pouch", 8]]);
    spilt.loot = [];
    S.spill(spilt, 24, 0, 1);
    expect(spilt.loot.map((i) => [i.kind, i.value])).toEqual([["pouch", 10], ["pouch", 10], ["pouch", 4]]);
    expect(Math.max(...drops.map((d) => Math.abs(d.x)))).toBeLessThanOrEqual(S.DROP_REACH);
    // All along the long valley, out to the castles, the more often toward its middle where the two meet.
    const near = drops.filter((d) => Math.abs(d.x) < S.DROP_REACH / 2).length;
    expect(drops.filter((d) => Math.abs(d.x) > S.GATE * 0.75).length).toBeGreaterThan(5);
    expect(near).toBeGreaterThan(drops.length - near);
  });
  test("the computer goes first for the other's sack, the valley over, before the loot by it (the user asked)", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const w = quiet(),
        me = w.bandits[0],
        cpu = w.bandits[1];
      me.x = -7;
      me.carry = 10;
      cpu.x = 6;
      lay(w, "pouch", 4.5);
      S.think(w, 1, level);
      expect(w.minds[1].goal?.what, level).toBe("chase");
      // With nothing in my sack it picks up the loot instead.
      const v = quiet();
      v.bandits[0].x = -7;
      v.bandits[1].x = 6;
      lay(v, "pouch", 4.5);
      S.think(v, 1, level);
      expect(v.minds[1].goal?.what, level).toBe("loot");
    }
  });
  test("the computer plays a whole match at every level, at the slower pace over the long valley: a few minutes, both castles filling; the better level wins more", () => {
    const play = (a: S.Level, b: S.Level, seed: number, target = 60) => {
      const w = S.createWorld(seed, target),
        seen: Record<string, number> = {};
      for (let k = 0; k < 900 / S.DT && !w.over; k++) for (const e of S.step(w, [S.think(w, 0, a), S.think(w, 1, b)])) seen[e.kind] = (seen[e.kind] ?? 0) + 1;
      return { w, seen, seconds: w.tick * S.DT };
    };
    for (const level of ["easy", "normal", "hard"] as const) {
      const { w, seen, seconds } = play(level, level, 41);
      expect(w.over, level).toBe(true);
      expect(Math.max(...w.treasury), level).toBeGreaterThanOrEqual(60);
      expect(Math.min(...w.treasury), level).toBeGreaterThan(15);
      expect(seen.deposit, level).toBeGreaterThan(4);
      expect(seen.pickup, level).toBeGreaterThan(10);
      // A match to 60 between two computers takes a minute or two (a person's match to 100, some minutes).
      expect(seconds, level).toBeGreaterThan(40);
      expect(seconds, level).toBeLessThan(200);
      expect(w.bandits.every((b) => Math.abs(b.x) <= S.X_MOST && b.y >= 0 && b.carry >= 0 && b.carry <= S.CAP)).toBe(true);
    }
    // The computer goes all along the valley: both bandits come far from their own gates in a match.
    const w = S.createWorld(5, 100),
      far = [0, 0];
    for (let k = 0; k < 900 / S.DT && !w.over; k++) {
      S.step(w, [S.think(w, 0, "hard"), S.think(w, 1, "normal")]);
      w.bandits.forEach((b, side) => (far[side] = Math.max(far[side], Math.abs(b.x - S.gateOf(side)))));
    }
    expect(Math.min(...far)).toBeGreaterThan(S.GATE * 0.8);
    let hard = 0;
    for (let seed = 1; seed <= 6; seed++) {
      if (play("easy", "hard", seed * 97, 100).w.treasury[1] >= 100) hard++;
      if (play("hard", "easy", seed * 97, 100).w.treasury[0] >= 100) hard++;
    }
    // (With pouches alone the gold comes in lumps and a close match can go either way: 21 of 24 over more seeds.)
    expect(hard).toBeGreaterThanOrEqual(9);
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

describe("gold raid: the slower pace and the long valley", () => {
  /** As the game was first made: gate at 9.3 m, a run of 5.6 m/s, a jump of 10.2 m/s under 26 m/s². */
  const BEFORE = { gate: 9.3, run: 5.6, jump: 10.2, g: 26 };
  test("the valley is 20 m (a little longer than the first) and a bandit runs at half the pace, jumping as high but more slowly", () => {
    const longer = S.GATE / BEFORE.gate;
    expect(2 * S.GATE).toBe(20);
    expect(longer).toBeGreaterThanOrEqual(1.05);
    expect(longer).toBeLessThanOrEqual(1.15);
    expect(S.X_MOST).toBeGreaterThan(S.GATE);
    expect(S.RUN).toBeLessThanOrEqual(BEFORE.run / 2);
    // From gate to gate takes over twice as long as it did.
    expect((2 * S.GATE) / S.RUN).toBeGreaterThan((2 * (2 * BEFORE.gate)) / BEFORE.run);
    // A jump rises as high (the ledges are reached as before) and hangs in the air longer.
    expect((S.JUMP * S.JUMP) / (2 * S.G)).toBeCloseTo((BEFORE.jump * BEFORE.jump) / (2 * BEFORE.g), 1);
    expect((2 * S.JUMP) / S.G).toBeGreaterThan((1.4 * 2 * BEFORE.jump) / BEFORE.g);
    // Measured: a bandit running for a second goes half as far as before, at most.
    const w = quiet(),
      b = w.bandits[0],
      from = b.x;
    run(w, 1, () => hands({ x: 1 }));
    expect(b.x - from).toBeLessThan(BEFORE.run / 2);
    expect(b.x - from).toBeGreaterThan(BEFORE.run / 3);
  });
  test("the ledges are alike on both sides, spread along the valley, and every one is reached by a jump from the road or a ledge under it", () => {
    const jump = (S.JUMP * S.JUMP) / (2 * S.G);
    expect(S.PLATFORMS.length).toBeGreaterThanOrEqual(6);
    for (const p of S.PLATFORMS) {
      expect(S.PLATFORMS.some((q) => q.y === p.y && Math.abs(q.x0 + p.x1) < 1e-9 && Math.abs(q.x1 + p.x0) < 1e-9)).toBe(true);
      const under = S.PLATFORMS.filter((q) => q.y < p.y && q.x0 < p.x1 && q.x1 > p.x0).map((q) => q.y);
      expect(p.y - Math.max(0, ...under)).toBeLessThan(jump - 0.2);
      expect(Math.abs(p.x1)).toBeLessThan(S.GATE - 3);
    }
    expect(Math.max(...S.PLATFORMS.map((p) => p.x1))).toBeGreaterThan(S.GATE * 0.6);
  });
  test("the eye follows a bandit along the valley, a little ahead the way it runs, and never past the castles", () => {
    const frame = L.goldRaidFrame(16 / 9, false);
    // Not the whole valley with its castles is in view at once.
    expect(frame.wide).toBeLessThan(2 * L.END * 0.7);
    // Standing it is near the middle of the view; running it is looked ahead of.
    expect(Math.abs(L.aimX(3, 0, 1, frame.wide) - 3)).toBeLessThan(frame.wide * 0.1);
    expect(L.aimX(3, S.RUN, 1, frame.wide)).toBeGreaterThan(L.aimX(3, 0, 1, frame.wide));
    expect(L.aimX(3, -S.RUN, -1, frame.wide)).toBeLessThan(3);
    // At a gate the view stops at the castle: its gate and the bandit in view, nothing past the valley's end.
    for (const side of [0, 1]) {
      const x = L.aimX(S.gateOf(side), 0, side ? 1 : -1, frame.wide);
      expect(Math.abs(x) + frame.wide / 2).toBeLessThanOrEqual(L.END + 1e-9);
      expect(Math.abs(S.gateOf(side) - x)).toBeLessThan(frame.wide / 2 - 1);
    }
    // A whole run from one gate to the other, the eye following smoothly: the bandit is always well in view.
    const w = quiet(),
      b = w.bandits[0];
    let eye = L.aimX(b.x, 0, b.face, frame.wide),
      worst = 0;
    for (let k = 0; k < 22 / S.DT; k++) {
      S.step(w, hands({ x: 1 }));
      const next = L.follow(eye, L.aimX(b.x, b.vx, b.face, frame.wide), S.DT);
      expect(Math.abs(next - eye)).toBeLessThan(S.RUN * 1.5 * S.DT);
      eye = next;
      worst = Math.max(worst, Math.abs(b.x - eye));
    }
    expect(b.x).toBe(S.X_MOST);
    expect(worst).toBeLessThan(frame.wide / 2 - 2);
  });
  test("two at one screen: near, one view holds both (drawing back as they part); far apart, the screen is split, and only nearer again is it one view", () => {
    for (const aspect of [16 / 9, 2.16]) {
      const wide = L.goldRaidFrame(aspect, aspect > 2).wide,
        half = L.goldRaidFrame(aspect / 2, aspect > 2).wide;
      expect(half).toBeGreaterThan(8);
      // At the start, at their gates: split if one view drawn back as far as it goes can't hold both (a desktop),
      // one view if it can (a phone held sideways sees most of the short valley).
      const start = (2 * (S.GATE - 1.6) + 2 * L.ROOM) / wide > L.ZOOM_MOST,
        ever = (2 * S.X_MOST + 2 * L.ROOM) / wide > L.ZOOM_MOST;
      expect(L.pairView(-S.GATE + 1.6, S.GATE - 1.6, wide, false).split).toBe(start);
      // Together: one view of the usual width.
      expect(L.pairView(-1, 1, wide, false)).toMatchObject({ split: false, zoom: 1 });
      let split = false,
        splits = 0;
      // Walking apart and back together, at every step both are in view: in the one view with room beside them.
      for (const gap of [...Array.from({ length: 60 }, (_, k) => k), ...Array.from({ length: 60 }, (_, k) => 59 - k)])
        for (const mid of [-15, 0, 12]) {
          const a = Math.max(-S.X_MOST, Math.min(S.X_MOST, mid - gap / 2)),
            b = Math.max(-S.X_MOST, Math.min(S.X_MOST, mid + gap / 2)),
            pair = L.pairView(a, b, wide, split);
          if (pair.split !== split && mid === 0) splits++;
          if (mid === 0) split = pair.split;
          if (!pair.split) {
            const reach = (wide * pair.zoom) / 2;
            expect(pair.zoom).toBeLessThanOrEqual(L.ZOOM_MOST);
            for (const x of [a, b]) expect(Math.abs(x - pair.x)).toBeLessThanOrEqual(reach - L.ROOM + 1e-9);
          }
        }
      // Once apart and once together again, and not to and fro (or never, where one view always holds both).
      expect(splits).toBe(ever ? 2 : 0);
      // Between where it splits and where it is one again, it stays as it is.
      const gap = wide * L.ZOOM_MOST * 0.93 - 2 * L.ROOM;
      expect(L.pairView(-gap / 2, gap / 2, wide, true).split).toBe(true);
      expect(L.pairView(-gap / 2, gap / 2, wide, false).split).toBe(false);
    }
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

describe("gold raid: the lever", () => {
  test("leaning it sideways runs, nothing in its middle, faster the further, full near its rim", () => {
    expect(H.leverRun(0)).toBe(0);
    expect(H.leverRun(0.15)).toBe(0);
    expect(H.leverRun(-0.15)).toBe(0);
    expect(H.leverRun(0.4)).toBeGreaterThan(0);
    expect(H.leverRun(0.4)).toBeLessThan(H.leverRun(0.7));
    expect(H.leverRun(0.9)).toBe(1);
    expect(H.leverRun(-1)).toBe(-1);
    expect(H.leverRun(-0.5)).toBeCloseTo(-H.leverRun(0.5));
  });
  test("a hand gives the lever's run, the keys outrank it, and letting go stands still", () => {
    const h = new H.Hand();
    h.lean(0.6, 0);
    expect(h.input().x).toBeCloseTo(H.leverRun(0.6));
    h.keys.add("left");
    expect(h.input().x).toBe(-1);
    h.keys.delete("left");
    h.lean(0, 0);
    expect(h.input().x).toBe(0);
    h.lean(-1, 0);
    h.clear();
    expect(h.input()).toEqual({ x: 0, jump: false, strike: false });
  });
  test("leaning it up jumps once; it jumps again only after coming back down", () => {
    const h = new H.Hand();
    h.lean(0, 0.3);
    expect(h.input().jump).toBe(false);
    h.lean(0, 0.8);
    expect(h.input().jump).toBe(true);
    // Held up, and wobbling up there: no more jumps.
    h.lean(0.1, 0.6);
    h.lean(0, 1);
    expect(h.input().jump).toBe(false);
    expect(h.input().jump).toBe(false);
    // Down past the rearm line and up again: one more.
    h.lean(0, 0.1);
    h.lean(0, 0.7);
    expect(h.input().jump).toBe(true);
    expect(h.jumps).toBe(2);
  });
  test("held up, it jumps again and again (each landing leaps anew); let down, it stops", () => {
    const h = new H.Hand();
    h.lean(0, 0.9);
    h.repeat(0);
    expect(h.input().jump).toBe(true);
    // Held: a fresh press every LEVER_REPEAT seconds, under the sim's jump buffer so it leaps as it lands.
    expect(H.LEVER_REPEAT).toBeLessThan(S.BUFFER);
    let pressed = 0;
    for (let t = 16; t <= 1000; t += 16) {
      h.repeat(t);
      if (h.input().jump) pressed++;
    }
    expect(pressed).toBeGreaterThanOrEqual(Math.floor(1 / H.LEVER_REPEAT) - 1);
    // Let down: no more.
    h.lean(0, 0);
    for (let t = 1016; t <= 1500; t += 16) {
      h.repeat(t);
      expect(h.input().jump).toBe(false);
    }
    // In the valley: held up, a bandit on the ground hops on and on.
    const w = S.createWorld(5);
    w.nextDrop = 1e9;
    const hand = new H.Hand();
    hand.lean(0, 1);
    let jumps = 0;
    for (let k = 0; k < 4 / S.DT; k++) {
      hand.repeat(k * S.DT * 1000);
      jumps += S.step(w, [hand.input(), { x: 0, jump: false, strike: false }]).filter((e) => e.kind === "jump" && e.side === 0).length;
    }
    expect(jumps).toBeGreaterThanOrEqual(3);
  });
  test("up and to the side at once runs and jumps, and a lean past the rim counts as the rim", () => {
    const h = new H.Hand();
    h.lean(3, 3);
    expect(h.lever.x).toBeCloseTo(Math.SQRT1_2);
    expect(h.lever.y).toBeCloseTo(Math.SQRT1_2);
    const input = h.input();
    expect(input.jump).toBe(true);
    expect(input.x).toBeGreaterThan(0.7);
  });
  test("a bandit run by half a lean runs slower than by a full one", () => {
    const pace = (lean: number) => {
      const w = S.createWorld(7);
      const from = w.bandits[0].x;
      for (let i = 0; i < 120; i++) S.step(w, [{ x: H.leverRun(lean), jump: false, strike: false }, S.IDLE]);
      return w.bandits[0].x - from;
    };
    expect(pace(0.5)).toBeGreaterThan(0.3);
    expect(pace(0.5)).toBeLessThan(pace(1) * 0.75);
  });
});

describe("gold raid: the load and getting up", () => {
  test("the more gold in the sack, the slower its bearer runs: full speed empty, 60% with a full sack", () => {
    expect(S.runOf(0)).toBe(S.RUN);
    expect(S.runOf(S.CAP)).toBeCloseTo(S.RUN * 0.6, 6);
    for (let c = 1; c <= S.CAP; c++) expect(S.runOf(c)).toBeLessThan(S.runOf(c - 1));
    // Measured: a bandit with 15 in its sack runs a second's way shorter than an empty one, by about its share.
    const far = (carry: number) => {
      const w = quiet(),
        b = w.bandits[0];
      b.carry = carry;
      const from = b.x;
      run(w, 2, () => hands({ x: 1 }));
      return b.x - from;
    };
    const empty = far(0),
      laden = far(15);
    expect(laden).toBeLessThan(empty * 0.8);
    expect(laden / empty).toBeCloseTo(S.runOf(15) / S.RUN, 1);
  });
  test("down, a bandit can be neither struck nor blown up; once it stands it may be struck at once", () => {
    const w = quiet(),
      [a, b] = w.bandits;
    a.x = 0;
    a.face = 1;
    b.x = 0.9;
    b.carry = 10;
    run(w, 0.2, (_, k) => hands({ strike: k === 0 }));
    expect(b.stun).toBeGreaterThan(0);
    // A bomb going off by it while it is down: it keeps the rest of its sack.
    const left = b.carry;
    a.x = b.x - 5;
    w.loot.push({ id: 999, kind: "bomb", value: 0, x: b.x, y: b.y + 0.5, vx: 0, vy: 0, rest: true, age: S.FUSE - 0.05, free: 0 });
    const blasts = run(w, 0.1, () => hands({})).filter((e) => e.kind === "boom");
    expect(blasts.length).toBe(1);
    expect(blasts[0]).toMatchObject({ stunned: [] });
    expect(b.carry).toBe(left);
    // It stands: the very next blow lands, with no safe time after getting up.
    run(w, S.STUN, () => hands({}));
    expect(b.stun).toBe(0);
    expect(b.ground).toBe(true);
    a.x = b.x - 0.9;
    a.y = b.y;
    a.face = 1;
    a.cool = 0;
    a.swing = -1;
    expect(run(w, 0.25, (_, k) => hands({ strike: k === 0 })).some((e) => e.kind === "hit")).toBe(true);
    expect(b.stun).toBeGreaterThan(0);
    // But the one who struck must wait a little longer than the stun before its next swing.
    expect(a.cool).toBeGreaterThan(S.STUN);
  });
});
