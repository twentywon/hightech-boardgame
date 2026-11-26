import { describe, expect, it } from "vitest";
import {
  ABILITY_COOL,
  ABILITY_FIRST,
  ARMY,
  DT,
  ERAS,
  FRONT,
  KILL_GOLD,
  KILL_XP,
  LOSS_XP,
  QUEUE,
  SELL_BACK,
  SPAWN,
  START_GOLD,
  XP_NEXT,
  command,
  computerSide,
  createWorld,
  freshMind,
  seconds,
  step,
  think,
  turretCost,
  type Command,
  type Level,
  type Unit,
  type World,
} from "../src/games/erawar/sim";
import { Inbox, Orders, blendPictures, packPicture, pictureOf, readPicture } from "../src/games/erawar/net";
import { createGame, eraWar, fallMove, play, timeMove } from "../src/games/erawar/rules";

/** Steps the world `s` seconds with no orders (or the given ones at the first step). */
function run(world: World, s: number, first: [Command[], Command[]] = [[], []]) {
  const events = [];
  for (let k = 0; k < Math.round(s / DT); k++) events.push(...step(world, k ? [[], []] : first));
  return events;
}
/** A soldier put straight onto the lane. */
function put(world: World, side: 0 | 1, x: number, era = 0, kind: 0 | 1 | 2 = 0): Unit {
  const t = ERAS[era].units[kind],
    u: Unit = { id: world.nextId++, side, era, kind, x, hp: t.hp, max: t.hp, cool: 0, since: 9, walking: false };
  world.units.push(u);
  return u;
}

describe("era war: the lane", () => {
  it("begins with two bases of the stone age, gold to start with, no soldiers and no turrets", () => {
    const w = createWorld(1);
    for (const a of w.armies) {
      expect(a.era).toBe(0);
      expect(a.hp).toBe(ERAS[0].base);
      expect(a.gold).toBe(START_GOLD);
      expect(a.turrets.every((t) => t === null)).toBe(true);
      expect(a.ability).toBe(ABILITY_FIRST);
    }
    expect(w.units).toEqual([]);
    expect(ERAS.map((e) => e.name)).toEqual(["석기", "중세", "화약", "현대"]);
  });
  it("trains a soldier for its price, sends it out of its own base's door after its training, and it walks at the foe", () => {
    const w = createWorld(2),
      club = ERAS[0].units[0];
    expect(command(w, 0, { kind: "train", unit: 0 })).toBe(true);
    // (Gold trickles in by the step, so compare against the price alone.)
    expect(w.armies[0].gold).toBe(START_GOLD - club.cost);
    expect(w.armies[0].queue).toHaveLength(1);
    run(w, club.train * 0.5);
    expect(w.units).toHaveLength(0);
    run(w, club.train * 0.6 + DT);
    expect(w.units).toHaveLength(1);
    const u = w.units[0];
    expect(u.side).toBe(0);
    expect(u.x).toBeGreaterThan(-SPAWN - 0.01);
    const x = u.x;
    run(w, 2);
    expect(u.x).toBeGreaterThan(x + 1.5);
    // The other side's go the other way.
    command(w, 1, { kind: "train", unit: 0 });
    run(w, club.train + 0.5);
    const theirs = w.units.find((v) => v.side === 1)!;
    expect(theirs.x).toBeLessThan(SPAWN);
  });
  it("keeps a queue of five at most and refuses what cannot be paid for", () => {
    const w = createWorld(3);
    w.armies[0].gold = 10_000;
    for (let k = 0; k < QUEUE; k++) expect(command(w, 0, { kind: "train", unit: 0 })).toBe(true);
    expect(command(w, 0, { kind: "train", unit: 0 })).toBe(false);
    w.armies[1].gold = ERAS[0].units[2].cost - 1;
    expect(command(w, 1, { kind: "train", unit: 2 })).toBe(false);
    expect(command(w, 1, { kind: "train", unit: 0 })).toBe(true);
  });
  it("lets no more than a side's limit onto the lane: training waits at the door", () => {
    const w = createWorld(4);
    for (let k = 0; k < ARMY; k++) put(w, 0, -12 + k * 0.8);
    w.armies[0].gold = 1000;
    command(w, 0, { kind: "train", unit: 0 });
    // Kept from walking on: an enemy wall of soldiers just ahead would let them; here simply the count is full.
    run(w, 3);
    expect(w.units.filter((u) => u.side === 0).length).toBeLessThanOrEqual(ARMY);
  });
  it("brings two fighters together, and the one killed pays the killer gold and experience (its own side learns a little)", () => {
    const w = createWorld(5),
      a = put(w, 0, -2),
      b = put(w, 1, 2);
    b.hp = 10;
    const gold = w.armies[0].gold;
    const events = run(w, 6);
    expect(events.some((e) => e.code === "melee")).toBe(true);
    expect(w.units).not.toContain(b);
    expect(w.units).toContain(a);
    const cost = ERAS[0].units[0].cost;
    expect(w.armies[0].xp).toBe(Math.round(cost * KILL_XP));
    expect(w.armies[1].xp).toBe(Math.round(cost * LOSS_XP));
    expect(w.armies[0].gold).toBeGreaterThanOrEqual(gold + Math.round(cost * KILL_GOLD) - 1);
    expect(w.armies[0].kills).toBe(1);
    expect(events.some((e) => e.code === "die" && e.side === 1)).toBe(true);
  });
  it("stops a soldier behind a friend ahead, and a shooter behind its fighter shoots over it", () => {
    const w = createWorld(6),
      front = put(w, 0, 0),
      back = put(w, 0, -3, 0, 1),
      foe = put(w, 1, 0.65);
    foe.hp = 1e6;
    front.hp = 1e6;
    const events = run(w, 4);
    // The shooter came up behind its fighter and no further.
    expect(back.x).toBeLessThan(front.x - 0.6);
    expect(back.x).toBeGreaterThan(-2.5);
    expect(events.some((e) => e.code === "shoot" && e.side === 0)).toBe(true);
    expect(foe.hp).toBeLessThan(1e6 - ERAS[0].units[1].dmg);
  });
  it("strikes the enemy's base when the way is clear, and a base brought to nothing loses the match", () => {
    const w = createWorld(7);
    put(w, 0, FRONT - 2, 3, 2);
    w.armies[1].hp = 50;
    run(w, 10);
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
    expect(w.armies[1].hp).toBe(0);
    expect(w.events.some((e) => e.code === "fall" && e.side === 1)).toBe(true);
  });
  it("builds a turret in an empty slot for its price; it shoots what comes near the base; sold, half comes back", () => {
    const w = createWorld(8),
      cost = turretCost(0);
    w.armies[0].gold = cost;
    expect(command(w, 0, { kind: "turret", slot: 1 })).toBe(true);
    expect(w.armies[0].gold).toBe(0);
    expect(command(w, 0, { kind: "turret", slot: 1 })).toBe(false);
    const foe = put(w, 1, -FRONT + 3);
    foe.hp = 1e6;
    // Kept still where it is: a wall of its own ahead (no, simply far enough to be in reach as it walks).
    const events = run(w, 2);
    expect(events.some((e) => e.code === "shoot" && e.side === 0)).toBe(true);
    expect(foe.hp).toBeLessThan(1e6);
    const before = w.armies[0].gold;
    expect(command(w, 0, { kind: "sell", slot: 1 })).toBe(true);
    expect(w.armies[0].gold).toBe(before + Math.round(cost * SELL_BACK));
    expect(w.armies[0].turrets[1]).toBeNull();
  });
  it("opens the next era with enough experience: a stronger base, stronger soldiers; those already queued keep their era", () => {
    const w = createWorld(9),
      a = w.armies[0];
    a.gold = 1000;
    command(w, 0, { kind: "train", unit: 0 });
    expect(command(w, 0, { kind: "era" })).toBe(false);
    a.xp = XP_NEXT[0];
    a.hp = 400;
    expect(command(w, 0, { kind: "era" })).toBe(true);
    expect(a.era).toBe(1);
    expect(a.max).toBe(ERAS[1].base);
    expect(a.hp).toBe(400 + ERAS[1].base - ERAS[0].base);
    command(w, 0, { kind: "train", unit: 0 });
    expect(a.queue.map((q) => q.era)).toEqual([0, 1]);
    run(w, 4);
    expect(w.units.filter((u) => u.side === 0).map((u) => u.era)).toEqual([0, 1]);
    // No era after the modern one.
    a.era = 3;
    a.xp = 1e9;
    expect(command(w, 0, { kind: "era" })).toBe(false);
  });
  it("sends the special attack down on the enemy's soldiers once it is ready, never on its base; then it waits again", () => {
    const w = createWorld(10);
    expect(command(w, 0, { kind: "ability" })).toBe(false);
    w.armies[0].ability = 0;
    const foes = [put(w, 1, 4), put(w, 1, 5), put(w, 1, 6)];
    for (const f of foes) f.cool = 99;
    const base = w.armies[1].hp;
    expect(command(w, 0, { kind: "ability" })).toBe(true);
    expect(w.armies[0].ability).toBe(ABILITY_COOL);
    run(w, 4);
    expect(foes.filter((f) => w.units.includes(f)).length).toBeLessThan(3);
    expect(w.armies[1].hp).toBe(base);
  });
  it("ends at the time limit with the base that has more of its strength left, alike a draw", () => {
    const w = createWorld(11, "quick");
    w.tick = Math.round(w.pace.limit / DT) - 2;
    w.armies[1].hp = w.armies[1].max * 0.5;
    run(w, 0.2);
    expect(w.over).toBe(true);
    expect(w.timeUp).toBe(true);
    expect(w.winner).toBe(0);
    const v = createWorld(12);
    v.tick = Math.round(v.pace.limit / DT) - 1;
    run(v, 0.2);
    expect(v.winner).toBeNull();
    expect(v.timeUp).toBe(true);
  });
});

describe("era war: the computer", () => {
  function match(a: Level, b: Level, seed: number) {
    const w = createWorld(seed),
      minds = [freshMind(), freshMind()];
    computerSide(w, 0, a);
    computerSide(w, 1, b);
    while (!w.over) step(w, [think(w, 0, a, minds[0]), think(w, 1, b, minds[1])]);
    return w;
  }
  it("plays a whole match to its end: trains, opens eras, uses its special attack", () => {
    const w = match("normal", "normal", 21);
    expect(w.over).toBe(true);
    expect(seconds(w)).toBeLessThanOrEqual(w.pace.limit + DT);
    for (const a of w.armies) {
      expect(a.trained).toBeGreaterThan(40);
      expect(a.era).toBeGreaterThanOrEqual(2);
    }
    expect(w.events.length).toBeGreaterThan(0);
  });
  it("the hard computer beats the easy one most of the time, from either side", () => {
    let wins = 0;
    for (let k = 0; k < 8; k++) {
      const hardLeft = k % 2 === 0,
        w = match(hardLeft ? "hard" : "easy", hardLeft ? "easy" : "hard", 100 + k);
      if (w.winner === (hardLeft ? 0 : 1)) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(6);
  }, 60_000);
});

describe("era war: over Wi-Fi", () => {
  it("tells the lane as numbers and reads it back as the same picture", () => {
    const w = createWorld(31);
    w.armies[0].gold = 1000;
    command(w, 0, { kind: "train", unit: 1 });
    command(w, 0, { kind: "turret", slot: 2 });
    put(w, 1, 3, 1, 2);
    run(w, 3);
    const p = pictureOf(w),
      back = readPicture(packPicture(p))!;
    expect(back).not.toBeNull();
    expect(back.sides[0].turrets).toEqual([-1, -1, 0]);
    expect(back.sides[0].era).toBe(0);
    expect(back.units.map((u) => [u.id, u.side, u.era, u.kind])).toEqual(p.units.map((u) => [u.id, u.side, u.era, u.kind]));
    for (const [i, u] of back.units.entries()) expect(u.x).toBeCloseTo(p.units[i].x, 2);
    expect(back.events.map((e) => e.code)).toEqual(p.events.map((e) => e.code));
    expect(readPicture([1, 2, 3])).toBeNull();
  });
  it("blends two pictures soldier by soldier", () => {
    const w = createWorld(32);
    put(w, 0, -5);
    const a = pictureOf(w);
    run(w, 1);
    const b = pictureOf(w),
      mid = blendPictures(a, b, 0.5);
    expect(mid.units[0].x).toBeCloseTo((a.units[0].x + b.units[0].x) / 2, 5);
  });
  it("carries out each of a guest's orders once, and all of a page come back after a drop", () => {
    const orders = new Orders(7),
      inbox = new Inbox();
    orders.give({ kind: "train", unit: 0 });
    orders.give({ kind: "ability" });
    expect(inbox.take(orders.data())).toEqual([{ kind: "train", unit: 0 }, { kind: "ability" }]);
    // The same sending again (sent over and over) carries out nothing more.
    expect(inbox.take(orders.data())).toEqual([]);
    orders.give({ kind: "turret", slot: 1 });
    expect(inbox.take(orders.data())).toEqual([{ kind: "turret", slot: 1 }]);
    // A page come back afresh: its orders are new ones.
    const again = new Orders(8);
    again.give({ kind: "era" });
    expect(inbox.take(again.data())).toEqual([{ kind: "era" }]);
    expect(inbox.take(null)).toEqual([]);
  });
});

describe("era war: the match", () => {
  it("ends with a base fallen or the time up", () => {
    const s = createGame("quick");
    expect(s.limit).toBe(600);
    const fell = play(s, fallMove(1))!;
    expect(fell.winner).toBe(0);
    expect(eraWar.reason(fell)).toContain("무너뜨렸");
    const draw = play(s, timeMove(null))!;
    expect(draw.winner).toBe("draw");
    expect(play(fell, fallMove(0))).toBeNull();
    expect(createGame("bogus").variant).toBe("normal");
  });
});
