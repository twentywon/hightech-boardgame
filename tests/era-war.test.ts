import { describe, expect, it } from "vitest";
import {
  ABILITY_COOL,
  ABILITY_FIRST,
  FALL_TIME,
  VOLLEY,
  ARMY,
  DT,
  ERAS,
  FRONT,
  KILL_GOLD,
  KILL_XP,
  LAST_ERA,
  LOSS_XP,
  MOMENTUM,
  QUEUE,
  RANK_BOOST,
  SELL_BACK,
  SPAWN,
  START_GOLD,
  XP_NEXT,
  command,
  computerSide,
  momentum,
  powerOf,
  rankCost,
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
import { createGame, eraWar, fallMove, play } from "../src/games/erawar/rules";
import { LIVE_MOST } from "../src/net/protocol";

/** Steps the world `s` seconds with no orders (or the given ones at the first step). */
function run(world: World, s: number, first: [Command[], Command[]] = [[], []]) {
  const events = [];
  for (let k = 0; k < Math.round(s / DT); k++) events.push(...step(world, k ? [[], []] : first));
  return events;
}
/** A soldier put straight onto the lane. */
function put(world: World, side: 0 | 1, x: number, era = 0, kind: 0 | 1 | 2 = 0): Unit {
  const t = ERAS[era].units[kind],
    u: Unit = { id: world.nextId++, side, era, kind, rank: 0, x, hp: t.hp, max: t.hp, cool: 0, since: 9, walking: false };
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
    expect(u.x).toBeCloseTo(x + club.speed * 2, 1);
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
    run(w, ERAS[0].units[0].train + ERAS[1].units[0].train + 1);
    expect(w.units.filter((u) => u.side === 0).map((u) => u.era)).toEqual([0, 1]);
    // No era after the modern one: there the button buys a rank (강화) with gold, not with experience.
    a.era = LAST_ERA;
    a.xp = 1e9;
    a.gold = rankCost(0) - 1;
    expect(command(w, 0, { kind: "era" })).toBe(false);
    expect(a.era).toBe(LAST_ERA);
  });
  it("in the last era buys ranks with gold, each dearer than the last; soldiers trained after one are stronger, those before keep theirs", () => {
    const w = createWorld(19),
      a = w.armies[0];
    a.era = LAST_ERA;
    a.gold = 50_000;
    command(w, 0, { kind: "train", unit: 0 });
    run(w, ERAS[LAST_ERA].units[0].train + 0.5);
    const plain = w.units.find((u) => u.side === 0)!;
    expect(plain.rank).toBe(0);
    expect(plain.max).toBe(ERAS[LAST_ERA].units[0].hp);
    const gold = a.gold;
    expect(command(w, 0, { kind: "era" })).toBe(true);
    expect(command(w, 0, { kind: "era" })).toBe(true);
    expect(a.rank).toBe(2);
    expect(a.gold).toBeCloseTo(gold - rankCost(0) - rankCost(1), 5);
    expect(rankCost(1)).toBeGreaterThan(rankCost(0));
    command(w, 0, { kind: "train", unit: 0 });
    run(w, ERAS[LAST_ERA].units[0].train + 1);
    const strong = w.units.find((u) => u.side === 0 && u.id !== plain.id)!;
    expect(strong.rank).toBe(2);
    expect(strong.max).toBe(Math.round(ERAS[LAST_ERA].units[0].hp * powerOf(2)));
    expect(powerOf(2)).toBeCloseTo(1 + 2 * RANK_BOOST, 9);
    expect(plain.max).toBe(ERAS[LAST_ERA].units[0].hp);
  });
  it("gives the last era's soldiers momentum: harder blows the further past the middle they stand, none before it", () => {
    expect(momentum({ side: 0, era: LAST_ERA, x: -3 })).toBe(1);
    expect(momentum({ side: 0, era: LAST_ERA, x: 0 })).toBe(1);
    expect(momentum({ side: 0, era: LAST_ERA, x: FRONT })).toBeCloseTo(1 + MOMENTUM, 9);
    expect(momentum({ side: 1, era: LAST_ERA, x: -FRONT / 2 })).toBeCloseTo(1 + MOMENTUM / 2, 9);
    expect(momentum({ side: 1, era: LAST_ERA, x: FRONT / 2 })).toBe(1);
    expect(momentum({ side: 0, era: LAST_ERA - 1, x: FRONT })).toBe(1);
    // Struck at the enemy's base: the fighter at its front hits it that much harder.
    const w = createWorld(20);
    w.armies[0].era = LAST_ERA;
    const u = put(w, 0, FRONT - 0.5, LAST_ERA, 0),
      base = w.armies[1].hp;
    step(w);
    expect(base - w.armies[1].hp).toBeCloseTo(ERAS[LAST_ERA].units[0].dmg * momentum(u), 3);
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
    run(w, VOLLEY + FALL_TIME + 0.5);
    expect(foes.filter((f) => w.units.includes(f)).length).toBeLessThan(3);
    expect(w.armies[1].hp).toBe(base);
  });
  it("lets the special attack fall slowly over the whole lane, each piece striking one soldier only (no splash)", () => {
    for (const [era, ab] of ERAS.map((e, k) => [k, e.ability] as const)) {
      const w = createWorld(40 + era);
      w.armies[0].era = era;
      w.armies[0].ability = 0;
      // Two soldiers standing together (one big enough to take every piece), never killed, never striking.
      const twins = [put(w, 1, 0, era, 0), put(w, 1, 0, era, 0)];
      for (const t of twins) {
        t.hp = t.max = 1e9;
        t.cool = 1e9;
      }
      command(w, 0, { kind: "ability" });
      const pieces = w.shots.filter((s) => s.kind === ab.shot);
      expect(pieces).toHaveLength(ab.count);
      for (const p of pieces) expect(p.time).toBe(FALL_TIME);
      const spots = pieces.map((p) => p.tx);
      // Base to base: from near one front to near the other.
      expect(Math.min(...spots)).toBeLessThan(-FRONT + 3);
      expect(Math.max(...spots)).toBeGreaterThan(FRONT - 3);
      // Still in the air a second into its fall, and only slowly lower.
      run(w, 1);
      for (const p of w.shots.filter((s) => s.kind === ab.shot && s.t > 0)) expect(p.y).toBeGreaterThan(5);
      run(w, VOLLEY + FALL_TIME);
      const taken = twins.map((t) => 1e9 - t.hp),
        strikes = taken.reduce((n, d) => n + d, 0) / ab.dmg;
      // Each piece that struck took its whole blow from one of the two, never from both.
      expect(Number.isInteger(Math.round(strikes * 1000) / 1000)).toBe(true);
      expect(strikes).toBeGreaterThan(0);
      expect(strikes).toBeLessThan(ab.count);
      for (const d of taken) expect(d / ab.dmg).toBeCloseTo(Math.round(d / ab.dmg), 6);
    }
  });
  it("trains slowly and walks slowly (the user asked): every soldier takes seconds to train, and none hurries", () => {
    for (const e of ERAS)
      for (const u of e.units) {
        expect(u.train).toBeGreaterThanOrEqual(2.5);
        expect(u.speed).toBeLessThanOrEqual(0.7);
      }
  });
  it("has no time limit: an untouched lane is still at war long after twenty minutes", () => {
    const w = createWorld(11);
    w.tick = Math.round((40 * 60) / DT);
    run(w, 1);
    expect(w.over).toBe(false);
    expect(w.winner).toBeNull();
  });
});

describe("era war: the computer", () => {
  /** A whole match of two computers (given up, unended, after `most` minutes). */
  function match(a: Level, b: Level, seed: number, most = 60) {
    const w = createWorld(seed),
      minds = [freshMind(), freshMind()];
    computerSide(w, 0, a);
    computerSide(w, 1, b);
    while (!w.over && seconds(w) < most * 60) step(w, [think(w, 0, a, minds[0]), think(w, 1, b, minds[1])]);
    return w;
  }
  it("plays a whole match to its end: trains, opens eras, uses its special attack", () => {
    const w = match("normal", "normal", 21);
    expect(w.over).toBe(true);
    expect(w.winner).not.toBeNull();
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
  it("ends every match with no time limit, whatever the two levels (even sides too): within half an hour of play", () => {
    const levels: Level[] = ["easy", "normal", "hard"],
      lengths: number[] = [];
    for (const a of levels)
      for (const b of levels)
        for (const seed of [600, 611]) {
          const w = match(a, b, seed + levels.indexOf(a) * 3 + levels.indexOf(b), 30);
          expect(w.over, `${a} v ${b} (${seed})`).toBe(true);
          lengths.push(seconds(w) / 60);
        }
    expect(Math.max(...lengths)).toBeLessThan(30);
  }, 240_000);
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
    expect(back.units.map((u) => [u.id, u.side, u.era, u.kind, u.rank, u.walking])).toEqual(p.units.map((u) => [u.id, u.side, u.era, u.kind, u.rank, u.walking]));
    for (const [i, u] of back.units.entries()) expect(u.since).toBeCloseTo(Math.min(9.9, p.units[i].since), 1);
    expect(back.sides.map((s) => [s.gold, s.era, s.rank, s.hp, s.max, s.queue, s.next])).toEqual(p.sides.map((s) => [s.gold, s.era, s.rank, s.hp, s.max, s.queue, s.next]));
    for (const [i, u] of back.units.entries()) expect(u.x).toBeCloseTo(p.units[i].x, 2);
    expect(back.events.map((e) => e.code)).toEqual(p.events.map((e) => e.code));
    expect(readPicture([1, 2, 3])).toBeNull();
  });
  it("fits a full lane with a special attack in the air into one live message, ranks and the last era told", () => {
    const w = createWorld(33);
    for (const a of w.armies) {
      a.era = LAST_ERA;
      a.rank = 23;
      a.gold = 123_456;
      a.queue = [0, 1, 2, 2, 0].map((kind) => ({ era: LAST_ERA, kind: kind as 0 | 1 | 2 }));
    }
    for (let k = 0; k < 14; k++) {
      put(w, 0, -12 + k * 0.8, LAST_ERA, (k % 3) as 0 | 1 | 2).rank = k;
      put(w, 1, 12 - k * 0.8, 3, (k % 3) as 0 | 1 | 2);
    }
    w.armies[0].ability = 0;
    w.armies[1].ability = 0;
    command(w, 0, { kind: "ability" });
    command(w, 1, { kind: "ability" });
    run(w, 1.5);
    const p = pictureOf(w),
      data = packPicture(p),
      back = readPicture(data)!;
    expect(data.length).toBeLessThanOrEqual(LIVE_MOST);
    expect(back.units.length).toBe(p.units.length);
    expect(back.units.map((u) => u.rank)).toEqual(p.units.map((u) => u.rank));
    expect(back.sides[0].rank).toBe(23);
    expect(back.sides[0].next).toBeNull();
    expect(back.sides[0].queue).toEqual([9, 10, 11, 11, 9]);
    expect(back.shots.length).toBeGreaterThan(8);
    // At the volleys' fullest, every falling piece is told (soldiers' quick shots wait when there is no room).
    run(w, 2);
    const full = pictureOf(w),
      told = readPicture(packPicture(full))!,
      falling = (list: { kind: string }[]) => list.filter((s) => s.kind === "bomb" || s.kind.startsWith("fall")).length;
    expect(falling(full.shots)).toBeGreaterThan(20);
    expect(falling(told.shots)).toBe(falling(full.shots));
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
  it("ends with a base fallen, and only so", () => {
    const s = createGame();
    const fell = play(s, fallMove(1))!;
    expect(fell.winner).toBe(0);
    expect(eraWar.reason(fell)).toContain("무너뜨렸");
    expect(play(s, fallMove(0))!.winner).toBe(1);
    expect(play(fell, fallMove(0))).toBeNull();
    expect(play(s, { from: -1, to: 10, extra: -1 })).toBeNull();
  });
});
