import { describe, expect, test } from "vitest";
import * as R from "../src/games/valet/rules";
import * as S from "../src/games/valet/sim";
import { driver } from "./valet-driver";

/** A world with one car in the valet's hand, standing at (x, z, heading) (left with me unless `state` says otherwise). */
function holding(stage: number, x: number, z: number, heading: number, state: S.CarState = "waiting") {
  const w = S.createWorld(stage, 3),
    lot = w.lot;
  w.nextArrival = 1e9;
  w.cars.push({ id: 1, x, z, heading, v: 0, steer: 0, style: 0, colour: 0, state, bay: -1, patience: lot.patience, patience0: lot.patience, late: false, bumped: false, dents: 0, t: 0, backAt: 0, rest: 0 });
  w.nextId = 2;
  w.hand = 1;
  return w;
}
/** Steps `world` for `seconds` with `input` (or what `hands` says each slice); everything that happened. */
function run(world: S.World, seconds: number, input: S.Input | ((w: S.World) => S.Input) = S.IDLE, until: (e: S.Happening) => boolean = () => false) {
  const seen: S.Happening[] = [];
  for (let k = 0; k < seconds / S.DT; k++)
    for (const e of S.step(world, typeof input === "function" ? input(world) : input)) {
      seen.push(e);
      if (until(e)) return seen;
    }
  return seen;
}
const gas = (g: number, steer = 0, handbrake = false): S.Input => ({ gas: g, steer, handbrake });

describe("valet parking: the lots", () => {
  test("every lot has numbered bays inside its walls, an entrance on the left and an exit on the right, and room to stand in each bay", () => {
    for (const stage of [1, 2, 3]) {
      const w = S.createWorld(stage, 1),
        lot = w.lot;
      expect(lot.bays.length).toBeGreaterThanOrEqual(11);
      expect(lot.bays.map((b) => b.n)).toEqual(lot.bays.map((_, k) => k + 1));
      expect(lot.entrance.x).toBeLessThan(-10);
      expect(lot.exit.x).toBeGreaterThan(10);
      for (const [k, bay] of lot.bays.entries()) {
        // A car in the bay's middle, along it, is clear of everything and counts as standing in it (either way round).
        expect(S.clear(w, 99, bay.x, bay.z, bay.angle), `${stage} bay ${k}`).toBe(true);
        expect(S.standing(bay, bay.x, bay.z, bay.angle).inside).toBe(true);
        expect(S.standing(bay, bay.x, bay.z, bay.angle + Math.PI).inside).toBe(true);
        expect(S.bayAt(w, 99, bay.x, bay.z, bay.angle)).toBe(k);
      }
      // The entrance's place and the aisle to the exit are clear.
      expect(S.clear(w, 99, lot.entrance.x, lot.entrance.z, 0)).toBe(true);
      expect(S.clear(w, 99, lot.exit.x, lot.exit.z, 0)).toBe(true);
    }
    // The second lot's bays are slanted; the third has bays along the wall (parallel parking) and pillars.
    expect(S.lotOf(2).bays.every((b) => Math.abs(Math.abs(b.angle) - Math.PI / 3) < 1e-9)).toBe(true);
    expect(S.lotOf(3).bays.some((b) => b.angle === 0 && b.l > 5.5)).toBe(true);
    expect(S.lotOf(3).pillars.length).toBeGreaterThan(3);
  });
});

describe("valet parking: driving", () => {
  test("the car goes forward and back by the pedals, no faster than its most, and rolls to a stop when they are let go", () => {
    const w = holding(1, -10, 0, 0);
    run(w, 1, gas(1));
    const car = S.carOf(w, 1)!;
    expect(car.v).toBeGreaterThan(2.5);
    expect(car.x).toBeGreaterThan(-9);
    expect(Math.abs(car.z)).toBeLessThan(1e-9);
    run(w, 3, gas(1));
    expect(car.v).toBeLessThanOrEqual(S.V_MOST);
    expect(car.v).toBeGreaterThan(S.V_MOST * 0.8);
    // Let go: it rolls to a stop, and stays stopped.
    const at = car.x;
    run(w, 4);
    expect(car.v).toBe(0);
    expect(car.x).toBeGreaterThan(at + 2);
    const rest = car.x;
    run(w, 1);
    expect(car.x).toBe(rest);
    // Back: it goes backward, slower.
    run(w, 2.5, gas(-1));
    expect(car.v).toBeLessThan(-2);
    expect(car.v).toBeGreaterThanOrEqual(-S.V_BACK);
    expect(car.x).toBeLessThan(rest - 2);
  });
  test("the back pedal brakes a car rolling forward before it backs, and the handbrake stops it short", () => {
    const braked = holding(1, -10, 0, 0),
      rolled = holding(1, -10, 0, 0),
      pulled = holding(1, -10, 0, 0);
    for (const w of [braked, rolled, pulled]) run(w, 1.5, gas(1));
    const from = S.carOf(braked, 1)!.x;
    run(braked, 0.5, gas(-1));
    run(rolled, 0.5);
    run(pulled, 0.5, gas(0, 0, true));
    expect(S.carOf(braked, 1)!.v).toBeLessThan(S.carOf(rolled, 1)!.v - 1.5);
    expect(S.carOf(braked, 1)!.x).toBeGreaterThan(from);
    expect(S.carOf(pulled, 1)!.v).toBe(0);
    expect(S.carOf(pulled, 1)!.x).toBeLessThan(S.carOf(braked, 1)!.x);
  });
  test("it turns by its front wheels: to the right clockwise, on a circle set by its wheelbase; backing, the other way", () => {
    const w = holding(1, 0, 0, 0),
      car = S.carOf(w, 1)!;
    // A slow full-lock turn: the heading changes by v·tan(δ)/L.
    car.v = 1.2;
    const seen: number[] = [];
    run(w, 3, (w) => {
      const c = S.carOf(w, 1)!;
      c.v = 1.2;
      seen.push(c.heading);
      return gas(0, 1);
    });
    expect(car.heading).toBeGreaterThan(0.5);
    const lock = car.steer;
    expect(lock).toBeGreaterThan(S.MAX_STEER * 0.9);
    expect(lock).toBeLessThanOrEqual(S.MAX_STEER);
    const rate = (seen.at(-1)! - seen.at(-121)!) / (120 * S.DT);
    expect(rate).toBeCloseTo((1.2 * Math.tan(lock)) / S.WHEELBASE, 2);
    // The rear axle's circle: wheelbase / tan(lock), under four metres.
    expect(S.WHEELBASE / Math.tan(S.MAX_STEER)).toBeLessThan(4);
    // Left turns the other way; backing with the wheels to the right turns the nose left.
    const left = holding(1, 0, 0, 0),
      back = holding(1, 0, 0, 0);
    run(left, 1.5, gas(1, -1));
    run(back, 1.5, gas(-1, 1));
    expect(S.carOf(left, 1)!.heading).toBeLessThan(-0.3);
    expect(S.carOf(back, 1)!.heading).toBeLessThan(-0.2);
    expect(S.carOf(left, 1)!.z).toBeLessThan(-0.2);
    // A car standing still does not turn, though its wheels do.
    const still = holding(1, 0, 0, 0);
    run(still, 1, gas(0, 1));
    expect(S.carOf(still, 1)!.heading).toBe(0);
    expect(S.carOf(still, 1)!.steer).toBeGreaterThan(0.5);
  });
});

describe("valet parking: walls, cars and bumps", () => {
  test("it cannot pass through the wall: it is stopped there, thrown back a little, and a hard knock is a bump with a fine", () => {
    const w = holding(1, 10, 0, 0, "requested");
    // The exit is ahead: keep it from being handed over by making it a car left with me.
    S.carOf(w, 1)!.state = "waiting";
    const seen = run(w, 4, gas(1));
    const car = S.carOf(w, 1)!;
    expect(car.x + S.CAR_L / 2).toBeLessThanOrEqual(w.lot.maxX + 1e-9);
    const bumps = seen.filter((e) => e.kind === "bump");
    expect(bumps.length).toBeGreaterThan(0);
    expect(bumps[0]).toMatchObject({ kind: "bump", car: 1, fined: true });
    expect(car.bumped).toBe(true);
    expect(car.dents).toBeGreaterThan(0);
    // Leaning on the wall afterwards is no new bump every slice: fines come at most once in a while.
    expect(bumps.filter((e) => e.kind === "bump" && e.fined).length).toBeLessThanOrEqual(Math.ceil(4 / S.BUMP_GAP));
    // A gentle touch (slower than a bump) is not fined.
    const soft = holding(1, w.lot.maxX - S.CAR_L / 2 - 0.05, 6, 0);
    expect(run(soft, 1, gas(1)).some((e) => e.kind === "bump")).toBe(false);
    expect(S.carOf(soft, 1)!.x + S.CAR_L / 2).toBeLessThanOrEqual(soft.lot.maxX + 1e-9);
  });
  test("it cannot pass through a parked car or a pillar", () => {
    const w = holding(1, -10, 0, 0);
    w.cars.push({ ...S.carOf(w, 1)!, id: 2, x: 0, z: 0, heading: Math.PI / 2, state: "parked", bay: -1, backAt: 1e9 });
    const seen = run(w, 5, gas(1));
    expect(seen.some((e) => e.kind === "bump")).toBe(true);
    // Its nose never gets past the other car's side.
    expect(S.carOf(w, 1)!.x + S.CAR_L / 2).toBeLessThanOrEqual(-S.CAR_W / 2 + 1e-6);
    expect(S.boxesTouch({ x: 0, z: 0, heading: 0, l: 4, w: 2 }, { x: 2.9, z: 0, heading: 0.3, l: 4, w: 2 })).toBe(true);
    expect(S.boxesTouch({ x: 0, z: 0, heading: 0, l: 4, w: 2 }, { x: 4.2, z: 0, heading: 0, l: 4, w: 2 })).toBe(false);
    const pillared = holding(3, -10, 1.2, 0);
    run(pillared, 6, gas(1));
    const p = pillared.lot.pillars.find((q) => q.z === 1.2)!;
    expect(S.carOf(pillared, 1)!.x + S.CAR_L / 2).toBeLessThanOrEqual(p.x - p.r + 1e-6);
  });
});

describe("valet parking: bays, pay and patience", () => {
  test("a car at rest inside a free bay, along it, is parked and paid; askew, over the line or still rolling, it is not", () => {
    const lot = S.lotOf(1),
      bay = lot.bays[3];
    const good = holding(1, bay.x, bay.z, bay.angle),
      seen = run(good, 1);
    const parked = seen.find((e) => e.kind === "parked")!;
    expect(parked).toMatchObject({ kind: "parked", car: 1, bay: 3 });
    // Quick and dead straight: the whole pay, tip and tidy bonus.
    expect(parked).toMatchObject({ tip: S.TIP, tidy: S.TIDY, pay: S.PAY + S.TIP + S.TIDY });
    expect(S.carOf(good, 1)!.state).toBe("parked");
    expect(good.hand).toBe(-1);
    expect(S.freeBays(good)).not.toContain(3);
    // Tail first counts the same.
    expect(run(holding(1, bay.x, bay.z, bay.angle + Math.PI), 1).some((e) => e.kind === "parked")).toBe(true);
    // Off to one side but inside the lines: parked, with less of the tidy bonus.
    const rough = run(holding(1, bay.x + 0.5, bay.z + 0.2, bay.angle + 0.15), 1).find((e) => e.kind === "parked") as { tidy: number };
    expect(rough.tidy).toBeLessThan(S.TIDY);
    // Over the line, too far turned, or half out of the bay: not parked.
    for (const [dx, dz, da] of [[0.9, 0, 0], [0, 0, 0.5], [0, 1.6, 0]]) expect(run(holding(1, bay.x + dx, bay.z + dz, bay.angle + da), 1).some((e) => e.kind === "parked"), `${dx} ${dz} ${da}`).toBe(false);
    // Still rolling through it: not yet.
    const rolling = holding(1, bay.x, bay.z + 2, bay.angle);
    S.carOf(rolling, 1)!.v = 1.5;
    expect(run(rolling, 0.3).some((e) => e.kind === "parked")).toBe(false);
    // A bay another car holds is not free: no parking there (the car cannot even stand in it).
    const taken = holding(1, bay.x, bay.z + 6, bay.angle);
    taken.cars.push({ ...S.carOf(taken, 1)!, id: 2, x: bay.x, z: bay.z, state: "parked", bay: 3, backAt: 1e9 });
    expect(S.freeBays(taken)).not.toContain(3);
    expect(S.bayAt(taken, 1, bay.x, bay.z, bay.angle)).toBe(-1);
  });
  test("a bump on the job loses its tips; a slow job gets a smaller tip", () => {
    const bay = S.lotOf(1).bays[2],
      bumped = holding(1, bay.x, bay.z, bay.angle);
    S.carOf(bumped, 1)!.bumped = true;
    expect(run(bumped, 1).find((e) => e.kind === "parked")).toMatchObject({ pay: S.PAY, tip: 0, tidy: 0 });
    const slow = holding(1, bay.x, bay.z, bay.angle);
    S.carOf(slow, 1)!.patience = S.carOf(slow, 1)!.patience0 / 3;
    const tip = (run(slow, 1).find((e) => e.kind === "parked") as { tip: number }).tip;
    expect(tip).toBeGreaterThan(0);
    expect(tip).toBeLessThan(S.TIP * 0.4);
  });
  test("a parked car's owner comes back and asks for it; driven into the exit it is handed over and paid, and its bay is free again", () => {
    const bay = S.lotOf(1).bays[0],
      w = holding(1, bay.x, bay.z, bay.angle);
    run(w, 1);
    const car = S.carOf(w, 1)!;
    expect(car.backAt).toBeGreaterThan(w.time + w.lot.stay[0] - 1);
    const asked = run(w, 60, S.IDLE, (e) => e.kind === "take");
    expect(asked.find((e) => e.kind === "ask")).toEqual({ kind: "ask", car: 1, bay: 0 });
    // The valet ran to it by itself and has it in hand.
    expect(w.hand).toBe(1);
    expect(car.state).toBe("requested");
    // Set in the aisle before the exit and driven in.
    Object.assign(car, { x: w.lot.exit.x - 5, z: 0, heading: 0 });
    const seen = run(w, 4, gas(1), (e) => e.kind === "returned");
    expect(seen.at(-1)).toMatchObject({ kind: "returned", car: 1 });
    expect((seen.at(-1) as { pay: number }).pay).toBeGreaterThan(S.PAY);
    expect(S.freeBays(w)).toContain(0);
    expect(w.hand).toBe(-1);
    run(w, 3);
    expect(car.state).toBe("gone");
  });
  test("customers come one at a time to the entrance, wait outside while it is taken, and the valet runs to the one with the least patience", () => {
    const w = S.createWorld(1, 5),
      seen = run(w, 8);
    expect(seen.find((e) => e.kind === "arrive")).toEqual({ kind: "arrive", car: 1 });
    const car = S.carOf(w, 1)!;
    expect(car).toMatchObject({ x: w.lot.entrance.x, z: w.lot.entrance.z, heading: 0, state: "waiting" });
    // The valet came running and has the car.
    expect(seen.some((e) => e.kind === "take")).toBe(true);
    expect(w.hand).toBe(1);
    // Not driven away: the next customers wait outside, at most `QUEUE_MOST`, and none rolls in.
    run(w, 60);
    expect(w.cars.filter((c) => c.state === "queue").length).toBe(S.QUEUE_MOST);
    expect(w.cars.filter((c) => c.state === "waiting" || c.state === "arriving").length).toBe(1);
  });
  test("patience runs out: a customer still waiting drives off, and it is told once; a job in hand goes on for the late pay", () => {
    const w = S.createWorld(1, 5);
    w.nextArrival = 0;
    run(w, 3, S.IDLE, (e) => e.kind === "arrive");
    w.nextArrival = 1e9;
    // Kept from the valet (it is sent nowhere): the customer waits out its patience.
    const car = S.carOf(w, 1)!;
    car.patience = 0.5;
    w.valet.left = 99;
    w.valet.whole = 99;
    const seen = run(w, 3);
    expect(seen.filter((e) => e.kind === "angry")).toEqual([{ kind: "angry", car: 1, left: true }]);
    expect(car.state === "leaving" || car.state === "gone").toBe(true);
    run(w, 3);
    expect(car.state).toBe("gone");
    expect(car.x).toBeLessThan(w.lot.minX);
    // In hand when its patience runs out: told, kept, and parked for the late pay.
    const bay = w.lot.bays[1],
      held = holding(1, bay.x, bay.z + 6, bay.angle);
    S.carOf(held, 1)!.patience = 0.2;
    expect(run(held, 1).filter((e) => e.kind === "angry")).toEqual([{ kind: "angry", car: 1, left: false }]);
    Object.assign(S.carOf(held, 1)!, { x: bay.x, z: bay.z });
    expect(run(held, 1).find((e) => e.kind === "parked")).toMatchObject({ pay: S.LATE_PAY, tip: 0, tidy: 0 });
  });
  test("the job may be changed before the car in hand has moved, not after", () => {
    const w = holding(1, -12.6, 0, 0);
    w.cars.push({ ...S.carOf(w, 1)!, id: 2, x: 0, z: -7, heading: -Math.PI / 2, state: "requested", bay: 3 });
    expect(S.nextJob(w)).toBe(true);
    expect(w.hand).toBe(-1);
    expect(w.valet.to).toBe(2);
    run(w, 5, S.IDLE, (e) => e.kind === "take");
    expect(w.hand).toBe(2);
    run(w, 1, gas(-1));
    expect(S.take(w, 1)).toBe(false);
    expect(w.hand).toBe(2);
  });
});

describe("valet parking: the shift", () => {
  /** A whole shift driven by the careful driver (by a wheel, or by keys: full lock or none). */
  function shift(stage: number, seed: number, keys: boolean) {
    const w = S.createWorld(stage, seed),
      log: string[] = [];
    let money = 0,
      mem = {},
      job = -1,
      goal: Parameters<typeof driver>[1] | null = null;
    const tally = { parked: 0, returned: 0, bumps: 0, angry: 0 };
    for (let k = 0; k < (S.SHIFT + 1) / S.DT; k++) {
      let input = S.IDLE;
      const car = w.hand >= 0 ? S.carOf(w, w.hand)! : null;
      if (!car) job = -1;
      else {
        if (job !== car.id) {
          job = car.id;
          mem = {};
          const bay = car.state === "waiting" ? w.lot.bays[S.freeBays(w)[0]] : w.lot.bays[car.bay];
          goal = car.state === "waiting" ? (bay ? { kind: "bay", x: bay.x, z: bay.z, angle: bay.angle } : null) : { kind: "exit", x: w.lot.exit.x, z: w.lot.exit.z, angle: 0, from: bay ? { x: bay.x, z: bay.z, angle: bay.angle } : null };
        }
        if (goal) {
          const d = driver(car, goal, mem);
          input = keys ? { gas: d.gas, steer: d.steer > 0.3 ? 1 : d.steer < -0.3 ? -1 : 0, handbrake: d.handbrake } : d;
        }
      }
      for (const e of S.step(w, input)) {
        log.push(`${k} ${JSON.stringify(e)}`);
        if (e.kind === "parked") [tally.parked, money] = [tally.parked + 1, money + e.pay];
        else if (e.kind === "returned") [tally.returned, money] = [tally.returned + 1, money + e.pay];
        else if (e.kind === "bump" && e.fined) [tally.bumps, money] = [tally.bumps + 1, money - S.BUMP_FINE];
        else if (e.kind === "angry") [tally.angry, money] = [tally.angry + 1, money - S.ANGRY_FINE];
      }
    }
    return { w, log, money, ...tally };
  }
  test("a careful driver works a whole shift in the first lot, by a wheel or by keys: cars parked and handed back, hardly a bump, money made", () => {
    for (const keys of [false, true]) {
      const s = shift(1, 7, keys);
      expect(s.w.over).toBe(true);
      expect(s.log.at(-1)).toContain('"end"');
      expect(s.parked, `${keys}`).toBeGreaterThanOrEqual(6);
      expect(s.returned, `${keys}`).toBeGreaterThanOrEqual(4);
      expect(s.bumps).toBeLessThanOrEqual(1);
      expect(s.angry).toBeLessThanOrEqual(1);
      expect(s.money).toBeGreaterThan(300);
    }
  });
  test("slanted bays are driven into as well", () => {
    const s = shift(2, 7, false);
    expect(s.parked).toBeGreaterThanOrEqual(5);
    expect(s.returned).toBeGreaterThanOrEqual(3);
  });
  test("the same driving on the same seed is the same shift; the shift ends once, at its time, and nothing moves after", () => {
    const a = shift(1, 11, true),
      b = shift(1, 11, true);
    expect(a.log.length).toBeGreaterThan(10);
    expect(b.log).toEqual(a.log);
    expect(shift(1, 12, true).log).not.toEqual(a.log);
    expect(a.log.filter((l) => l.includes('"end"'))).toHaveLength(1);
    expect(a.w.time).toBeGreaterThanOrEqual(S.SHIFT);
    expect(a.w.time).toBeLessThan(S.SHIFT + 2 * S.DT);
    expect(S.step(a.w, gas(1))).toEqual([]);
  });
  test("the rules add the pay up, take the fines off and end with the shift", () => {
    let s = R.createGame(2);
    expect(s.stage).toBe(2);
    expect(R.createGame(9).stage).toBe(3);
    s = R.play(s, R.parkedMove(42))!;
    s = R.play(s, R.returnedMove(30))!;
    s = R.play(s, { from: -1, to: R.BUMP, extra: -1 })!;
    s = R.play(s, { from: -1, to: R.ANGRY, extra: -1 })!;
    expect(s).toMatchObject({ money: 42 + 30 - S.BUMP_FINE - S.ANGRY_FINE, parked: 1, returned: 1, bumps: 1, angry: 1, winner: null, ply: 4 });
    expect(R.play(s, R.parkedMove(R.MOST + 1))).toBeNull();
    expect(R.play(s, { from: -1, to: 50, extra: -1 })).toBeNull();
    expect(R.play(s, { from: 0, to: R.BUMP, extra: -1 })).toBeNull();
    s = R.play(s, { from: -1, to: R.END, extra: -1 })!;
    expect(s.winner).toBe(0);
    expect(R.play(s, R.parkedMove(20))).toBeNull();
    expect(R.moves(s)).toEqual([]);
    expect(R.valet.reason!(s)).toContain("5,200원");
  });
});
