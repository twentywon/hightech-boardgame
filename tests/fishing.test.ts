import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as fr from "../src/games/fishing/rules";
import * as fs from "../src/games/fishing/sim";
import { CrankReader } from "../src/games/fishing/crank";

const plain = (to: number) => ({ from: -1, to, extra: -1 });
/** Steps the lake until `until` holds (or `limit` seconds pass), gathering what happened. */
function run(world: fs.World, until: (world: fs.World, seen: fs.Happening[]) => boolean, limit = 30) {
  const seen: fs.Happening[] = [];
  for (let k = 0; k < limit / fs.DT && !until(world, seen); k++) seen.push(...fs.step(world));
  return seen;
}
/** How many slices pass until `until` holds. */
function count(world: fs.World, until: (world: fs.World, seen: fs.Happening[]) => boolean, limit = 30) {
  const seen: fs.Happening[] = [];
  let slices = 0;
  for (; slices < limit / fs.DT && !until(world, seen); slices++) seen.push(...fs.step(world));
  return { seen, slices };
}
/** A world with a fish of `kind` and `size` just biting at the middle of the lake. */
function biting(kind: number, size: number, level = 2, seed = 5) {
  const world = fs.createWorld(level, seededRandom(seed));
  fs.cast(world, fs.CAST.middle.x, fs.CAST.middle.z);
  run(world, (w) => w.phase === "wait");
  world.fish = { kind, size, points: fs.pointsOf(kind, size) };
  world.nibbles = 0;
  world.nibbleIn = 0;
  run(world, (w) => w.phase === "bite");
  return world;
}
/** The crank turned at `rate` turns a second over one slice. */
const turn = (world: fs.World, rate: number) => fs.crank(world, rate * fs.DT);
/** Plays the fight as a careful hand does: turns the crank quickly while the fish is not running and the line is not too tight. */
function reelCarefully(world: fs.World, limit = 60, rate = 2.4) {
  const seen: fs.Happening[] = [];
  for (let k = 0; k < limit / fs.DT && world.phase === "fight"; k++) {
    if (world.surge || world.tension > 0.85) fs.release(world);
    else turn(world, rate);
    seen.push(...fs.step(world));
  }
  return seen;
}
/** The seconds a careful hand at `rate` turns a second takes to bring a fish in (Infinity: not in `limit`). */
function timeToLand(rate: number, limit = 60) {
  const world = biting(fs.CRUCIAN, 20, 1, 8);
  fs.press(world);
  world.surgeIn = Infinity;
  let k = 0;
  for (; k < limit / fs.DT && world.phase === "fight"; k++) {
    turn(world, rate);
    fs.step(world);
  }
  return world.phase === "land" ? k * fs.DT : Infinity;
}

describe("fishing", () => {
  test("there is no clock and no level: only what the water reports changes the score, and the fishing never ends", () => {
    let s = fr.createGame();
    expect("left" in s || "level" in s).toBe(false);
    s = fr.play(s, plain(fr.CAST))!;
    s = fr.play(s, plain(fr.SCARED))!;
    s = fr.play(s, plain(fr.SNAP))!;
    s = fr.play(s, fr.catchMove(fs.CARP, 50))!;
    expect([s.casts, s.lost, s.score, s.caught.length]).toEqual([1, 2, fs.pointsOf(fs.CARP, 50), 1]);
    expect(s.landed).toEqual({ kind: fs.CARP, size: 50, points: 30 });
    // A catch must name a kind and a size its points agree with.
    expect(fr.play(s, { from: -1, to: fr.CATCH + 31, extra: fs.CARP * 1000 + 50 })).toBeNull();
    expect(fr.play(s, { from: -1, to: fr.CATCH + 5, extra: fs.CARP * 1000 + 10 })).toBeNull();
    expect(fr.play(s, { from: -1, to: fr.CATCH, extra: 99 * 1000 + 10 })).toBeNull();
    expect(fr.play(s, { from: -1, to: fr.HOOK, extra: 3 })).toBeNull();
    // The old clock's move is no move now.
    expect(fr.play(s, plain(0))).toBeNull();
    // Junk is worth its flat points: a can nothing, a boot one.
    expect(fr.play(fr.createGame(), fr.catchMove(fs.CAN, 12))!.score).toBe(0);
    expect(fr.play(s, fr.catchMove(fs.BOOT, 28))!.score).toBe(s.score + 1);
    // However long one fishes, nobody wins and the game goes on.
    for (let k = 0; k < 300; k++) s = fr.play(s, plain(fr.CAST))!;
    expect(s.winner).toBeNull();
    expect(fr.moves(s).length).toBeGreaterThan(0);
    expect(fr.fishing.tally(s)[0]).not.toContain("시간");
    expect(fr.fishing.reason(s)).toContain("잉어 50cm");
  });
  test("a cast lands within reach, fish nibble and then bite, and a press at the bite hooks the fish", () => {
    const world = fs.createWorld(1, seededRandom(11));
    expect(fs.cast(world, 40, -90)).toEqual([{ kind: "cast", ...fs.reach(40, -90) }]);
    expect(world.target.z).toBe(-fs.CAST.far);
    expect(Math.abs(world.target.x)).toBeLessThanOrEqual(fs.CAST.side);
    // Nothing more can be cast while the float is out.
    expect(fs.cast(world, 0, -10)).toEqual([]);
    const seen = run(world, (w) => w.phase === "bite");
    expect(seen.some((e) => e.kind === "splashdown")).toBe(true);
    const fish = world.fish!;
    if (!fs.KINDS[fish.kind].junk) expect(seen.some((e) => e.kind === "nibble")).toBe(true);
    expect(seen.findIndex((e) => e.kind === "bite")).toBeGreaterThan(seen.findIndex((e) => e.kind === "splashdown"));
    expect(fs.press(world)).toEqual([{ kind: "hook", x: world.float.x, z: world.float.z, fish }]);
    expect(world.phase).toBe("fight");
    // Hooked, nothing winds until the crank is turned.
    expect(world.reeling).toBe(false);
  });
  test("the reel winds only as the crank is turned, and the quicker it turns, the sooner the fish comes in", () => {
    // Held, not turned: a press during the fight does nothing, and the line goes slack until the fish gets off.
    const held = biting(fs.TROUT, 40, 1, 3);
    fs.press(held);
    held.surgeIn = Infinity;
    const from = fs.distance(held);
    const seen = run(held, (w) => {
      fs.press(w);
      return w.phase !== "fight";
    });
    expect(seen.at(-1)?.kind).toBe("slip");
    expect(fs.distance(held)).toBeCloseTo(from, 5);
    // Turned: quicker turning lands it sooner; too slow a turn does not wind at all, and the fish gets off.
    const fast = timeToLand(2.6),
      steady = timeToLand(1.4);
    expect(fast).toBeLessThan(steady);
    expect(steady).toBeLessThan(Infinity);
    expect(timeToLand(0.2)).toBe(Infinity);
  });
  test("the crank's speed is the turns made, smoothed: a turn a press four times a second keeps it winding", () => {
    const world = biting(fs.CARP, 50, 1, 4);
    fs.press(world);
    world.surgeIn = Infinity;
    const speeds: number[] = [];
    for (let k = 0; k < 3 / fs.DT; k++) {
      if (k % 15 === 0) fs.crank(world, 0.5);
      fs.step(world);
      if (k > 60) speeds.push(world.spin);
    }
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    expect(mean).toBeGreaterThan(1.7);
    expect(mean).toBeLessThan(2.3);
    expect(Math.min(...speeds)).toBeGreaterThan(fs.SPIN_MIN);
    // Let go, it stops at once; turns given away from the fight count for nothing.
    fs.release(world);
    expect([world.spin, world.reeling]).toEqual([0, false]);
    const idle = fs.createWorld(1, seededRandom(2));
    fs.crank(idle, 3);
    expect(idle.owed).toBe(0);
  });
  test("a press before the bite scares the fish off; with no fish there, the line just comes in", () => {
    const world = fs.createWorld(2, seededRandom(4));
    fs.cast(world, 0, -12);
    run(world, (w) => w.phase === "wait");
    expect(fs.press(world)[0].kind).toBe("empty");
    expect(world.phase).toBe("reel");
    const back = run(world, (w) => w.phase === "ready");
    expect(back.at(-1)).toEqual({ kind: "ready" });
    fs.cast(world, 0, -12);
    run(world, (_, seen) => seen.some((e) => e.kind === "nibble"));
    expect(world.nibbling).toBe(true);
    expect(fs.press(world)[0].kind).toBe("scared");
    expect(world.fish).toBeNull();
  });
  test("the bite passes if nobody strikes in its window", () => {
    for (const level of [1, 2, 3]) {
      const world = biting(fs.CRUCIAN, 20, level),
        { seen, slices } = count(world, (w) => w.phase !== "bite");
      expect(seen.find((e) => e.kind === "late")).toBeTruthy();
      // The window is the level's, to a slice.
      expect(Math.abs(slices * fs.DT - fs.LEVELS[level - 1].bite)).toBeLessThan(2 * fs.DT + 1e-9);
    }
  });
  test("a fish reeled with care is landed, and lifted out with its kind and size", () => {
    const world = biting(fs.CARP, 55, 2, 8);
    fs.press(world);
    const seen = reelCarefully(world);
    const caught = seen.find((e) => e.kind === "catch");
    expect(caught).toMatchObject({ fish: { kind: fs.CARP, size: 55, points: fs.pointsOf(fs.CARP, 55) } });
    expect(seen.some((e) => e.kind === "surge")).toBe(true);
    expect(world.phase).toBe("land");
    run(world, (w) => w.phase === "ready");
    expect(world.landed).toBeNull();
  });
  test("reeling on through a surge snaps the line", () => {
    const world = biting(fs.CATFISH, 80, 3, 2);
    fs.press(world);
    const seen = run(
      world,
      (w) => {
        turn(w, 2.4);
        return w.phase !== "fight";
      },
      60,
    );
    expect(seen.some((e) => e.kind === "surge")).toBe(true);
    expect(seen.at(-1)?.kind).toBe("snap");
    expect(world.phase).toBe("reel");
  });
  test("a line left slack too long lets the fish get off, but a surge's running line does not count", () => {
    const world = biting(fs.TROUT, 40, 1, 3);
    fs.press(world);
    fs.release(world);
    world.surgeIn = 100;
    const { seen, slices } = count(world, (w) => w.phase !== "fight");
    expect(seen.at(-1)?.kind).toBe("slip");
    expect(slices * fs.DT).toBeGreaterThan(fs.SLACK);
    expect(slices * fs.DT).toBeLessThan(fs.SLACK + 0.1);
    // While it runs, line is paid out without slack piling up.
    const other = biting(fs.TROUT, 40, 1, 3);
    fs.press(other);
    fs.release(other);
    other.surgeIn = 0;
    run(other, (w) => !!w.surge);
    run(other, (w) => !w.surge);
    expect(other.slack).toBeLessThanOrEqual(fs.DT + 1e-9);
  });
  test("junk does not fight: no surges, and slack does not lose it", () => {
    const world = biting(fs.BOOT, 28, 3, 9);
    fs.press(world);
    fs.release(world);
    run(world, () => false, 5);
    expect(world.phase).toBe("fight");
    const seen = run(
      world,
      (w) => {
        turn(w, 2);
        return w.phase !== "fight";
      },
      30,
    );
    expect(seen.some((e) => e.kind === "surge")).toBe(false);
    expect(seen.at(-1)).toMatchObject({ kind: "catch", fish: { kind: fs.BOOT, points: 1 } });
  });
  test("when the round is over nothing more bites, seconds stop, and a line out comes in", () => {
    const world = biting(fs.CRUCIAN, 20, 1, 6);
    fs.press(world);
    fs.retire(world);
    const seen = run(world, (w) => w.phase === "ready");
    expect(seen.every((e) => e.kind === "ready")).toBe(true);
    expect(fs.cast(world, 0, -10)).toEqual([]);
  });
  test("the same seed and the same hand make the same lake", () => {
    const play = () => {
      const world = fs.createWorld(2, seededRandom(42)),
        log: string[] = [];
      for (let k = 0; k < 60 / fs.DT; k++) {
        if (world.phase === "ready") fs.cast(world, -3, -16);
        if (world.phase === "bite" && world.t > 0.2) fs.press(world);
        if (world.phase === "fight") {
          if (world.surge || world.tension > 0.85) fs.release(world);
          else turn(world, 2.2);
        }
        for (const e of fs.step(world)) if (e.kind !== "second") log.push(JSON.stringify(e));
      }
      return log;
    };
    const first = play();
    expect(first.length).toBeGreaterThan(5);
    expect(first.some((e) => e.includes('"catch"'))).toBe(true);
    expect(play()).toEqual(first);
  });
  test("sizes and points stay within each kind's range", () => {
    const world = fs.createWorld(3, seededRandom(1));
    for (let k = 0; k < 500; k++) {
      world.float = { x: 0, z: -(fs.CAST.near + (k % 18)) };
      const fish = fs.draw(world),
        kind = fs.KINDS[fish.kind];
      expect(fish.size).toBeGreaterThanOrEqual(kind.min);
      expect(fish.size).toBeLessThanOrEqual(kind.max);
      expect(fish.points).toBe(fs.pointsOf(fish.kind, fish.size));
      expect(fr.play(fr.createGame(world.sea), fr.catchMove(fish.kind, fish.size))!.score).toBe(fish.points);
    }
  });
  test("circles drawn on the screen are turns of the crank: a whole circle one turn, either way round; strokes and scrubs none", () => {
    const circle = (r: CrankReader, laps: number, sense = 1, radius = 60, steps = 40) => {
      let turns = 0;
      for (let k = 0; k <= laps * steps; k++) {
        const a = (sense * 2 * Math.PI * k) / steps;
        turns += r.add(300 + radius * Math.cos(a), 300 + radius * Math.sin(a));
      }
      return turns;
    };
    expect(circle(new CrankReader(), 3)).toBeCloseTo(3, 0);
    expect(circle(new CrankReader(), 2, -1, 25, 24)).toBeCloseTo(2, 0);
    // A straight stroke, and a scrub back and forth, turn nothing.
    const line = new CrankReader();
    let straight = 0;
    for (let k = 0; k < 40; k++) straight += line.add(100 + k * 8, 200 + k * 3);
    expect(straight).toBeLessThan(0.02);
    const scrub = new CrankReader();
    let back = 0;
    for (let k = 0; k < 40; k++) back += scrub.add(100 + (k % 2) * 30, 200);
    expect(back).toBe(0);
  });
  test("the sea has its own kinds, big to small, and the lake its own; each round takes only its water's catches", () => {
    const atSeaGame = () => fr.fishing.create("sea");
    const kindsAt = (sea: boolean) => {
      const world = fs.createWorld(3, seededRandom(sea ? 12 : 13), sea),
        seen = new Set<number>();
      for (let k = 0; k < 3000; k++) {
        world.float = { x: 0, z: -(fs.CAST.near + (k % 18)) };
        seen.add(fs.draw(world).kind);
      }
      return seen;
    };
    const sea = kindsAt(true),
      lake = kindsAt(false);
    for (const kind of sea) expect(fs.caughtIn(kind, true), fs.KINDS[kind].name).toBe(true);
    for (const kind of lake) expect(fs.caughtIn(kind, false), fs.KINDS[kind].name).toBe(true);
    // Every sea fish comes up, the tuna (the biggest) too, and no lake fish does.
    for (const kind of [fs.HORSE_MACKEREL, fs.MACKEREL, fs.ROCKFISH, fs.EEL, fs.PORGY, fs.FLATFISH, fs.YELLOWTAIL, fs.TUNA, fs.MARLIN, fs.SHARK, fs.WHALE, fs.STARFISH]) expect(sea.has(kind), fs.KINDS[kind].name).toBe(true);
    expect(sea.has(fs.CRUCIAN) || sea.has(fs.CARP) || sea.has(fs.BOOT) || sea.has(fs.FROG) || sea.has(fs.CRAYFISH)).toBe(false);
    // The lake has its frog and crayfish (the user asked), and none of the sea's.
    for (const kind of [fs.CRUCIAN, fs.CARP, fs.TROUT, fs.CATFISH, fs.GOLDEN, fs.FROG, fs.CRAYFISH]) expect(lake.has(kind), fs.KINDS[kind].name).toBe(true);
    expect(lake.has(fs.TUNA) || lake.has(fs.WHALE) || lake.has(fs.SHARK)).toBe(false);
    // The red sea bream is gone (the user asked); the whale is the biggest of all.
    expect(fs.KINDS.some((k) => k.name === "참돔")).toBe(false);
    expect(Math.max(...fs.KINDS.map((k) => k.max))).toBe(fs.KINDS[fs.WHALE].max);
    // Every size fits a catch move (kind × 1000 + size), and every catch's points within the rules' bound.
    for (const [kind, k] of fs.KINDS.entries()) {
      expect(k.max, k.name).toBeLessThan(1000);
      expect(fs.pointsOf(kind, k.max), k.name).toBeLessThanOrEqual(fr.MOST);
    }
    expect(fr.play(atSeaGame(), fr.catchMove(fs.WHALE, 850))!.score).toBe(fs.pointsOf(fs.WHALE, 850));
    expect(fs.KINDS[fs.TUNA].max).toBeGreaterThan(2 * fs.KINDS[fs.HORSE_MACKEREL].max);
    // The stages: "s1".."s3" are the sea; a catch from the other water is refused.
    const atSea = fr.fishing.create("sea");
    expect(atSea.sea).toBe(true);
    expect(fr.fishing.create("lake").sea).toBe(false);
    // An old stage remembered from before the levels went ("s2", "3") still opens its water.
    expect(fr.fishing.create("s2").sea).toBe(true);
    expect(fr.fishing.create("3").sea).toBe(false);
    expect(fr.play(atSea, fr.catchMove(fs.TUNA, 180))!.score).toBe(fs.pointsOf(fs.TUNA, 180));
    expect(fr.play(atSea, fr.catchMove(fs.CARP, 50))).toBeNull();
    expect(fr.play(fr.createGame(false), fr.catchMove(fs.TUNA, 180))).toBeNull();
    expect(fr.play(atSea, fr.catchMove(fs.CAN, 12))).not.toBeNull();
  });
  test("at sea the same fish takes far longer to bring in, and surges harder, longer and more often", () => {
    const landTime = (sea: boolean) => {
      const world = fs.createWorld(2, seededRandom(21), sea);
      fs.cast(world, fs.CAST.middle.x, fs.CAST.middle.z);
      run(world, (w) => w.phase === "wait");
      world.fish = { kind: fs.PORGY, size: 40, points: fs.pointsOf(fs.PORGY, 40) };
      world.nibbles = 0;
      world.nibbleIn = 0;
      run(world, (w) => w.phase === "bite");
      fs.press(world);
      world.surgeIn = Infinity;
      let k = 0;
      for (; k < 120 / fs.DT && world.phase === "fight"; k++) {
        turn(world, 2.2);
        fs.step(world);
      }
      return k * fs.DT;
    };
    expect(landTime(true)).toBeGreaterThan(1.6 * landTime(false));
    // Surges: watched over a long fight held still (the fish never landed), their strength, length and number.
    const surges = (sea: boolean) => {
      const world = biting(fs.YELLOWTAIL, 60, 2, 30);
      world.sea = sea;
      fs.press(world);
      const found: { power: number; length: number }[] = [];
      let surging = 0;
      for (let k = 0; k < 60 / fs.DT; k++) {
        world.slack = 0;
        world.tension = 0;
        world.float = { x: 0, z: -14 };
        for (const e of fs.step(world)) if (e.kind === "surge") found.push({ power: e.power, length: world.surge!.length });
        if (world.surge) surging++;
      }
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      return { share: (surging * fs.DT) / 60, power: mean(found.map((f) => f.power)), length: mean(found.map((f) => f.length)) };
    };
    const lake = surges(false),
      sea = surges(true);
    // Running a larger share of the fight (longer surges, shorter rests between them).
    expect(sea.share).toBeGreaterThan(1.4 * lake.share);
    expect(sea.power).toBeGreaterThan(1.15 * lake.power);
    expect(sea.length).toBeGreaterThan(1.3 * lake.length);
  });
  test("a hooked fish rests a good while between its surges (the user found it ran too often), at sea no more often than on the lake", () => {
    const rests = (sea: boolean) => {
      const world = biting(fs.CARP, 50, 2, 40);
      world.sea = sea;
      fs.press(world);
      const starts: number[] = [];
      let first = -1;
      for (let k = 0; k < 120 / fs.DT; k++) {
        world.slack = 0;
        world.tension = 0;
        world.float = { x: 0, z: -14 };
        for (const e of fs.step(world)) if (e.kind === "surge") starts.push(k * fs.DT);
        if (first < 0 && starts.length) first = starts[0];
      }
      return { first, count: starts.length, gap: (starts[starts.length - 1] - starts[0]) / (starts.length - 1) };
    };
    const lake = rests(false),
      sea = rests(true);
    // The first surge only after a moment's grace; then one every six seconds or so (a carp at the one pace left).
    expect(lake.first).toBeGreaterThan(1.1);
    expect(lake.gap).toBeGreaterThan(5);
    expect(sea.count).toBeLessThanOrEqual(lake.count);
  });
});
