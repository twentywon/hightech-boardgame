import { describe, expect, test } from "vitest";
import * as bb from "../src/games/shooting/bb";
import * as clay from "../src/games/shooting/clay";
import * as hunt from "../src/games/shooting/hunt";
import { passing } from "../src/games/shooting/common";
import { LINED_UP, RIGS, aimAt, direction, dragFor, dragTurn, misalignment, shotDirection, shotError, wander, type Aim, type Offset } from "../src/games/shooting/layout";
import * as rules from "../src/games/shooting/rules";
import { createWorld, fire, step, type Happening, type World } from "../src/games/shooting/sim";

const ALIGNED: Offset = { x: 0, y: 0 };
const move = (to: number, extra = -1) => ({ from: -1, to, extra });
/** Steps a world until `until` says so (or `limit` seconds), gathering what happened. */
function run(world: World, seconds: number, until?: (h: Happening) => boolean) {
  const out: Happening[] = [];
  for (let k = 0; k < seconds * 120; k++) {
    const now = step(world);
    out.push(...now);
    if (until && now.some(until)) break;
  }
  return out;
}
/** Lights target `i` of a booth (blue unless `lit` says yellow) for a good while. */
function light(world: bb.BBWorld, i: number, lit: 1 | 2 = 1) {
  world.targets[i].lit = lit;
  world.targets[i].until = world.t + 30;
  world.next = world.t + 60;
}

describe("shooting: the sights", () => {
  test("lined up, the shot goes exactly where the front sight points; off line, it goes the front sight's way", () => {
    for (const mode of ["bb", "clay", "hunt"] as const) {
      const aim: Aim = { yaw: 0.12, pitch: -0.05 },
        straight = shotDirection(aim, shotError(mode, ALIGNED)),
        d = direction(aim);
      expect(straight.x).toBeCloseTo(d.x, 12);
      expect(straight.y).toBeCloseTo(d.y, 12);
      expect(straight.z).toBeCloseTo(d.z, 12);
      // The rear sight wandered right and low: the front sight stands left and high in it, and so does the shot.
      const error = shotError(mode, { x: 10, y: -6 });
      expect(error.x).toBeCloseTo(-10 * RIGS[mode].gain, 12);
      expect(error.y).toBeCloseTo(6 * RIGS[mode].gain, 12);
      const off = shotDirection(aim, error),
        angle = Math.acos(Math.min(1, off.x * d.x + off.y * d.y + off.z * d.z)) * 1000;
      expect(angle).toBeCloseTo(Math.hypot(error.x, error.y), 1);
      // Twice the misalignment, twice the error.
      const twice = shotError(mode, { x: 20, y: -12 });
      expect(Math.hypot(twice.x, twice.y)).toBeCloseTo(2 * Math.hypot(error.x, error.y), 12);
    }
  });
  test("the rear sight wanders slowly, comes into line now and then, and starts well off it", () => {
    for (const mode of ["bb", "clay", "hunt"] as const) {
      const rig = RIGS[mode];
      let lined = 0,
        widest = 0,
        jump = 0,
        last = wander(mode, 0.3, 4.2);
      expect(misalignment(wander(mode, 0.27, 4.2))).toBeGreaterThan(LINED_UP);
      for (let t = 0.3; t < 30; t += 0.01) {
        const o = wander(mode, t, 4.2);
        if (misalignment(o) <= LINED_UP) lined++;
        widest = Math.max(widest, misalignment(o));
        jump = Math.max(jump, Math.hypot(o.x - last.x, o.y - last.y));
        last = o;
      }
      expect(lined).toBeGreaterThan(0);
      expect(widest).toBeLessThanOrEqual(rig.wander + 1e-9);
      // Slow: never more than a few milliradians in a hundredth of a second.
      expect(jump).toBeLessThan(1);
      // The same seed and time always give the same offset.
      expect(wander(mode, 7.77, 1.5)).toEqual(wander(mode, 7.77, 1.5));
    }
  });
  test("a drag turns the gun as far as the finger goes, and back", () => {
    const turn = dragTurn("hunt", 120, -40, 800),
      back = dragFor("hunt", turn, 800);
    expect(turn.yaw).toBeGreaterThan(0);
    expect(turn.pitch).toBeGreaterThan(0);
    expect(back.dx).toBeCloseTo(120, 9);
    expect(back.dy).toBeCloseTo(-40, 9);
  });
});

describe("shooting: the BB booth", () => {
  test("a lined-up pellet at a lit target's middle scores its bull; the same at a dark one scores nothing", () => {
    const world = bb.createBB(0, 11);
    world.next = 999;
    light(world, 4);
    const target = world.targets[4];
    expect(fire(world, aimAt("bb", target), ALIGNED)[0].kind).toBe("shot");
    const hit = run(world, 2, (h) => h.kind === "hit").find((h) => h.kind === "hit");
    expect(hit).toMatchObject({ kind: "hit", target: 4, bull: true, points: bb.BLUE * 2, combo: 1 });
    // The pellet takes its time to fly.
    expect(world.t).toBeGreaterThan(4 / bb.BB_SPEED);
    fire(world, aimAt("bb", world.targets[9]), ALIGNED);
    const after = run(world, 2, (h) => h.kind === "tick");
    expect(after.some((h) => h.kind === "hit")).toBe(false);
    expect(after.find((h) => h.kind === "tick")).toMatchObject({ target: 9 });
  });
  test("a yellow target is worth more; off the bull half as much; badly misaligned the pellet misses", () => {
    const world = bb.createBB(0, 3);
    light(world, 2, 2);
    const t = world.targets[2];
    fire(world, aimAt("bb", { x: t.x + 0.045, y: t.y, z: t.z }), ALIGNED);
    expect(run(world, 2, (h) => h.kind === "hit").find((h) => h.kind === "hit")).toMatchObject({ points: bb.YELLOW, bull: false });
    light(world, 3);
    const u = world.targets[3];
    // 30 mrad of rear sight off line at the booth sends the pellet some 3 cm off: still on the face.
    fire(world, aimAt("bb", u), { x: 30, y: 0 });
    const hit = run(world, 2, (h) => h.kind === "hit" || h.kind === "tick").find((h) => h.kind === "hit" || h.kind === "tick");
    expect(hit?.kind).toBe("hit");
    expect(hit && "bull" in hit && hit.bull).toBe(false);
    light(world, 5);
    fire(world, aimAt("bb", world.targets[5]), { x: 400, y: 400 });
    expect(run(world, 2, (h) => h.kind === "tick").some((h) => h.kind === "hit")).toBe(false);
  });
  test("hits within the combo window multiply; a pause past it starts again", () => {
    const world = bb.createBB(2, 5),
      points: number[] = [],
      combos: number[] = [];
    const shoot = (i: number) => {
      light(world, i);
      fire(world, aimAt("bb", world.targets[i]), ALIGNED);
      const h = run(world, 2, (x) => x.kind === "hit").find((x) => x.kind === "hit") as Extract<Happening, { kind: "hit" }>;
      points.push(h.points);
      combos.push(h.combo);
    };
    shoot(0);
    shoot(1);
    shoot(2);
    run(world, bb.COMBO + 0.2);
    shoot(3);
    expect(combos).toEqual([1, 2, 3, 1]);
    expect(points).toEqual([20, 40, 60, 20]);
    expect(bb.pointsFor(2, true, 9)).toBe(bb.YELLOW * 2 * bb.MOST_COMBO);
  });
  test("the round ends once the last pellet has landed; the magazine reloads; an empty gun clicks", () => {
    const world = bb.createBB(0, 8),
      seen: Happening[] = [];
    for (let k = 0; k < 200 && !world.done; k++) {
      seen.push(...fire(world, aimAt("bb", world.targets[k % 18]), ALIGNED));
      seen.push(...run(world, 0.4));
    }
    expect(world.done).toBe(true);
    expect(seen.filter((h) => h.kind === "shot")).toHaveLength(bb.TIERS[0].pellets);
    expect(seen.filter((h) => h.kind === "reload").length).toBe(bb.TIERS[0].pellets / bb.MAG - 1);
    expect(seen.some((h) => h.kind === "click")).toBe(true);
    expect(seen.filter((h) => h.kind === "done")).toHaveLength(1);
    expect(fire(world, { yaw: 0, pitch: 0 }, ALIGNED)).toEqual([{ kind: "click" }]);
  });
  test("the booth plays the same from the same seed and the same shots", () => {
    const play = () => {
      const world = createWorld("bb", 1, 1234),
        log: string[] = [];
      for (let k = 0; k < 60; k++) {
        log.push(...run(world, 0.25).map((h) => JSON.stringify(h)));
        const lit = (world as bb.BBWorld).targets.findIndex((t) => t.lit);
        if (lit >= 0) log.push(...fire(world, aimAt("bb", (world as bb.BBWorld).targets[lit]), wander("bb", k * 0.37, 2)).map((h) => JSON.stringify(h)));
      }
      return log;
    };
    const a = play();
    expect(a.some((line) => line.includes('"hit"'))).toBe(true);
    expect(play()).toEqual(a);
  });
});

describe("shooting: clays", () => {
  /** A world with a clay in the air, flown `seconds` from the house. */
  function flying(seed: number, seconds: number) {
    const world = clay.createClay(seed);
    run(world, clay.READY + 0.05, (h) => h.kind === "launch");
    run(world, seconds);
    return world;
  }
  test("a pattern at the clay breaks it; one well off misses; two barrels, then the gun clicks", () => {
    const world = flying(21, 0.5),
      at = world.clay!.p,
      out = fire(world, aimAt("clay", at), ALIGNED);
    expect(out.map((h) => h.kind)).toEqual(["shot", "break"]);
    expect(out[1]).toMatchObject({ barrel: 1 });
    expect(world.card).toEqual([1]);
    const other = flying(22, 0.5),
      p = other.clay!.p;
    expect(fire(other, aimAt("clay", { x: p.x + 3, y: p.y + 2, z: p.z }), ALIGNED).map((h) => h.kind)).toEqual(["shot"]);
    const second = fire(other, aimAt("clay", other.clay!.p), ALIGNED);
    expect(second.find((h) => h.kind === "break")).toMatchObject({ barrel: 2 });
    expect(fire(other, aimAt("clay", { x: 0, y: 5, z: -30 }), ALIGNED)).toEqual([{ kind: "click" }]);
  });
  test("the pattern widens with the distance", () => {
    const world = clay.createClay(5),
      aim: Aim = { yaw: 0, pitch: 0.1 },
      pellets = clay.pattern(world, aim, ALIGNED),
      from = RIGS.clay.pivot,
      d = direction(aim),
      spread = (range: number) => Math.max(...pellets.map((p) => passing(from, d, { x: from.x + p.x * range, y: from.y + p.y * range, z: from.z + p.z * range }).across));
    expect(pellets).toHaveLength(clay.PELLETS);
    expect(spread(30)).toBeCloseTo(spread(10) * 3, 6);
    expect(spread(25)).toBeGreaterThan(0.3);
    expect(spread(25)).toBeLessThan(0.7);
  });
  test("a clay not hit falls whole; the round is over after the last clay; the range replays from its seed", () => {
    const world = clay.createClay(9),
      seen = run(world, 400, (h) => h.kind === "done");
    expect(seen.filter((h) => h.kind === "launch")).toHaveLength(clay.CLAYS);
    expect(seen.filter((h) => h.kind === "lost")).toHaveLength(clay.CLAYS);
    expect(world.phase).toBe("over");
    const again = clay.createClay(9);
    expect(run(again, 400, (h) => h.kind === "done").map((h) => JSON.stringify(h))).toEqual(seen.map((h) => JSON.stringify(h)));
    // Clays fly at their own angles and speeds.
    const ways = new Set(seen.filter((h) => h.kind === "launch").map((h) => (h as { clay: clay.Clay }).clay.v.x.toFixed(2)));
    expect(ways.size).toBeGreaterThan(20);
  });
});

describe("shooting: the hunt", () => {
  /** A world with one animal of `id` standing broadside at (x, z), looking right. */
  function standing(id: hunt.Kind["id"], x = 0, z = -25) {
    const world = hunt.createHunt(77);
    world.nextSpawn = 999;
    const animal = hunt.spawn(world, id);
    Object.assign(animal, { p: { x, y: id === "duck" || id === "pheasant" ? 6 : 0, z }, heading: Math.PI / 2, doing: id === "duck" || id === "pheasant" ? "fly" : "graze", until: 999, v: { x: 8, y: 0, z: 0 } });
    world.animals.push(animal);
    return { world, animal };
  }
  const zoneAt = (animal: hunt.Animal, zone: hunt.Zone) => hunt.partAt(animal, hunt.kindOf(animal.kind).parts.find((p) => p.zone === zone)!);
  test("each zone takes its own health; the legs slow most; at no health the animal falls and is taken", () => {
    for (const zone of ["head", "body", "legs"] as const) {
      const { world, animal } = standing("deer");
      const out = fire(world, aimAt("hunt", zoneAt(animal, zone)), ALIGNED);
      expect(out.find((h) => h.kind === "wound")).toMatchObject({ zone });
      expect(animal.health).toBe(hunt.kindOf("deer").health - hunt.DAMAGE[zone]);
      expect(animal.slow).toBeCloseTo(hunt.SLOW[zone], 9);
      expect(animal.doing).toBe("flee");
    }
    expect(hunt.SLOW.legs).toBeLessThan(hunt.SLOW.body);
    expect(hunt.DAMAGE.head).toBeGreaterThan(hunt.DAMAGE.body);
    expect(hunt.DAMAGE.body).toBeGreaterThan(hunt.DAMAGE.legs);
    // A deer takes two head shots, or three to the body.
    const { world, animal } = standing("deer");
    fire(world, aimAt("hunt", zoneAt(animal, "head")), ALIGNED);
    world.boltUntil = 0;
    const second = fire(world, aimAt("hunt", zoneAt(animal, "head")), ALIGNED);
    expect(second.find((h) => h.kind === "take")).toMatchObject({ points: hunt.kindOf("deer").points });
    expect(animal.doing).toBe("fall");
  });
  test("every kind has its own health; bigger game takes more shots and is worth more", () => {
    const healths = hunt.KINDS.map((k) => k.health),
      points = hunt.KINDS.map((k) => k.points);
    expect(new Set(healths).size).toBeGreaterThan(3);
    expect(hunt.kindOf("bear").health).toBeGreaterThan(hunt.kindOf("deer").health);
    expect(hunt.kindOf("bear").points).toBeGreaterThan(hunt.kindOf("rabbit").points);
    expect(Math.max(...points)).toBe(hunt.kindOf("bear").points);
    // A bird is taken by one shot to its body; a wing only wounds it.
    const duck = standing("duck");
    expect(fire(duck.world, aimAt("hunt", zoneAt(duck.animal, "body")), ALIGNED).some((h) => h.kind === "take")).toBe(true);
    // Flying away, its wings stand out to either side.
    const wing = standing("pheasant");
    wing.animal.heading = Math.PI;
    const flutter = fire(wing.world, aimAt("hunt", zoneAt(wing.animal, "wing")), ALIGNED).find((h) => h.kind === "wound");
    expect(flutter).toMatchObject({ zone: "wing" });
  });
  test("a hit animal goes slower than it would have", () => {
    const far = (hurt: boolean) => {
      const { world, animal } = standing("boar", -10, -20);
      Object.assign(animal, { doing: "flee", side: 1 });
      if (hurt) animal.slow = hunt.SLOW.legs;
      const x0 = animal.p.x;
      run(world, 1);
      return animal.p.x - x0;
    };
    expect(far(true)).toBeLessThan(far(false) * 0.6);
  });
  test("animals come out and go again; the hunt replays from its seed; the clock tells every second", () => {
    const go = () => {
      const world = hunt.createHunt(4321);
      return run(world, hunt.SESSION).map((h) => (h.kind === "second" ? "s" : `${h.kind}:${"animal" in h ? h.animal.kind : ""}`));
    };
    const a = go();
    expect(a.filter((h) => h === "s")).toHaveLength(hunt.SESSION);
    expect(a.filter((h) => h.startsWith("spawn")).length).toBeGreaterThan(8);
    expect(a.filter((h) => h.startsWith("escape")).length).toBeGreaterThan(3);
    expect(new Set(a.filter((h) => h.startsWith("spawn"))).size).toBeGreaterThan(3);
    expect(go()).toEqual(a);
  });
  test("the cartridges run out: the bolt, the reload, a click, then the hunt is over", () => {
    const world = hunt.createHunt(3);
    world.nextSpawn = 999;
    const seen: Happening[] = [];
    for (let k = 0; k < 60 && !world.done; k++) {
      seen.push(...fire(world, { yaw: 0, pitch: -0.2 }, ALIGNED));
      seen.push(...run(world, 0.6));
    }
    expect(seen.filter((h) => h.kind === "shot")).toHaveLength(hunt.CARTRIDGES);
    expect(seen.filter((h) => h.kind === "reload")).toHaveLength(hunt.CARTRIDGES / hunt.MAG - 1);
    expect(seen.some((h) => h.kind === "click")).toBe(true);
    expect(seen.filter((h) => h.kind === "done")).toHaveLength(1);
  });
});

describe("shooting: the rules", () => {
  test("BB: pellets spent and points scored; over at the last pellet's landing", () => {
    let s = rules.createGame("bb", { tier: "1" });
    expect([s.mode, s.tier, s.ammo]).toEqual(["bb", 1, bb.TIERS[1].pellets]);
    s = rules.play(s, move(rules.SHOT))!;
    s = rules.play(s, move(rules.HIT + 20, 1))!;
    s = rules.play(s, move(rules.HIT + 40, 2))!;
    expect([s.score, s.ammo, s.hits, s.best]).toEqual([60, bb.TIERS[1].pellets - 1, 2, 2]);
    s = rules.play(s, move(rules.DONE))!;
    expect(s.winner).toBe(0);
    expect(rules.reason(s).startsWith("60점!")).toBe(true);
    expect(rules.play(s, move(rules.SHOT))).toBeNull();
  });
  test("clay: each clay's result; over with the twenty-fifth", () => {
    let s = rules.createGame("clay");
    expect(rules.play(s, move(rules.BREAK, 1))).toBeNull();
    for (let k = 0; k < clay.CLAYS; k++) {
      s = rules.play(s, move(rules.LAUNCH))!;
      s = rules.play(s, move(rules.SHOT))!;
      s = rules.play(s, k % 3 ? move(rules.BREAK, k % 2 ? 1 : 2) : move(rules.LOST))!;
    }
    expect(s.winner).toBe(0);
    expect(rules.broken(s)).toBe(16);
    expect(rules.reason(s).startsWith(`25개 가운데 16개 명중!`)).toBe(true);
  });
  test("hunt: the clock runs out; taken animals score by kind", () => {
    let s = rules.createGame("hunt");
    s = rules.play(s, move(rules.SHOT))!;
    s = rules.play(s, move(rules.WOUND, 2))!;
    s = rules.play(s, move(rules.TAKE + 3, 0))!;
    expect(s.score).toBe(hunt.KINDS[3].points);
    expect(s.bag[3]).toBe(1);
    expect(rules.play(s, move(rules.TAKE + 99, 0))).toBeNull();
    for (let k = 0; k < hunt.SESSION; k++) s = rules.play(s, move(rules.TICK))!;
    expect(s.winner).toBe(0);
    expect(rules.reason(s).startsWith(`${hunt.KINDS[3].points}점!`)).toBe(true);
  });
});
