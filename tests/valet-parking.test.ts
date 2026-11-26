import { describe, expect, test } from "vitest";
import * as R from "../src/games/valet/rules";
import * as S from "../src/games/valet/sim";
import { driver } from "./valet-driver";

/** A world with one car in the valet's hand, standing at (x, z, heading) (left with me, its customer having named bay `want`, unless `state` says otherwise). */
function holding(stage: number, x: number, z: number, heading: number, state: S.CarState = "waiting", want = -1) {
  const w = S.createWorld(stage, 3),
    lot = w.lot;
  w.nextArrival = 1e9;
  w.cars.push({ id: 1, x, z, heading, v: 0, steer: 0, style: 0, colour: 0, state, bay: -1, want, taken: true, patience: lot.patience, patience0: lot.patience, late: false, bumped: false, dents: 0, t: 0, backAt: 0 });
  w.nextId = 2;
  w.hand = 1;
  return w;
}
/** The same, with the car on its own (the valet on foot at (vx, vz)). */
function standingBy(stage: number, x: number, z: number, heading: number, vx: number, vz: number, state: S.CarState = "waiting") {
  const w = holding(stage, x, z, heading, state);
  w.hand = -1;
  const car = S.carOf(w, 1)!;
  Object.assign(car, { taken: false });
  Object.assign(w.valet, { x: vx, z: vz });
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
const walk = (x: number, z: number): S.Input => ({ gas: 0, steer: 0, handbrake: false, walkX: x, walkZ: z });
/** Parks the car in hand (it is let out in its bay) and what that brought. */
const parkIt = (w: S.World) => S.alight(w).find((e) => e.kind === "parked") as Extract<S.Happening, { kind: "parked" }> | undefined;

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

describe("valet parking: the valet on foot", () => {
  test("the valet goes where the lever leads it, as fast as its lean, facing that way; let go, it stands", () => {
    const w = S.createWorld(1, 2);
    w.nextArrival = 1e9;
    Object.assign(w.valet, { x: 0, z: 0 });
    run(w, 1, walk(1, 0));
    expect(w.valet.x).toBeCloseTo(S.WALK, 1);
    expect(w.valet.z).toBeCloseTo(0, 6);
    expect(w.valet.speed).toBeCloseTo(S.WALK, 6);
    expect(w.valet.heading).toBeCloseTo(0, 6);
    // Half the lean, half the speed; up the screen (-z) and to the left together.
    run(w, 1, walk(-0.5 * Math.SQRT1_2, -0.5 * Math.SQRT1_2));
    expect(w.valet.x).toBeCloseTo(S.WALK - (S.WALK / 2) * Math.SQRT1_2, 1);
    expect(w.valet.z).toBeCloseTo(-(S.WALK / 2) * Math.SQRT1_2, 1);
    expect(w.valet.heading).toBeCloseTo((-3 * Math.PI) / 4, 6);
    // A lean of more than the whole is the whole.
    const at = w.valet.x;
    run(w, 0.5, walk(3, 0));
    expect(w.valet.x - at).toBeCloseTo(S.WALK / 2, 1);
    const [x, z] = [w.valet.x, w.valet.z];
    run(w, 1);
    expect([w.valet.x, w.valet.z, w.valet.speed]).toEqual([x, z, 0]);
  });
  test("it cannot walk through the kerbs, a car, the booth or a pillar: it is stopped at them and slides along", () => {
    const w = S.createWorld(1, 2),
      lot = w.lot;
    w.nextArrival = 1e9;
    Object.assign(w.valet, { x: 0, z: 0 });
    run(w, 4, walk(0, -1));
    expect(w.valet.z).toBeCloseTo(lot.minZ + S.BODY, 6);
    run(w, 6, walk(1, 0));
    expect(w.valet.x).toBeCloseTo(lot.maxX - S.BODY, 6);
    // A car standing across the way: stopped at its side, however hard it is walked into; pushed along it, it slides.
    w.cars.push({ id: 5, x: 0, z: 0, heading: 0, v: 0, steer: 0, style: 0, colour: 0, state: "parked", bay: -1, want: -1, taken: true, patience: 1, patience0: 1, late: false, bumped: false, dents: 0, t: 0, backAt: 1e9 });
    Object.assign(w.valet, { x: -6, z: 0.2 });
    run(w, 3, walk(1, 0));
    expect(w.valet.x).toBeCloseTo(-S.CAR_L / 2 - S.BODY, 6);
    run(w, 1, walk(1, -1));
    expect(w.valet.z).toBeLessThan(-S.CAR_W / 2 - S.BODY + 1e-6);
    expect(w.valet.x).toBeGreaterThan(0);
    // The booth by the entrance.
    const booth = lot.blocks[0];
    Object.assign(w.valet, { x: booth.x, z: booth.z + booth.hz + 2 });
    run(w, 2, walk(0, -1));
    expect(w.valet.z).toBeCloseTo(booth.z + booth.hz + S.BODY, 6);
    // A pillar in the underground lot's aisle.
    const deep = S.createWorld(3, 2),
      p = deep.lot.pillars.find((q) => q.z === 1.2)!;
    deep.nextArrival = 1e9;
    Object.assign(deep.valet, { x: p.x - 4, z: p.z });
    run(deep, 2, walk(1, 0));
    expect(deep.valet.x).toBeCloseTo(p.x - p.r - S.BODY, 6);
  });
  test("a car rolling in through the entrance pushes the valet standing there aside", () => {
    const w = S.createWorld(1, 4);
    Object.assign(w.valet, { x: w.lot.entrance.x, z: 0.2 });
    run(w, 4, S.IDLE, (e) => e.kind === "arrive");
    const car = S.carOf(w, 1)!;
    expect(car.state).toBe("waiting");
    // Clear of the car, wherever it was pushed to.
    const along = (w.valet.x - car.x) * Math.cos(car.heading) + (w.valet.z - car.z) * Math.sin(car.heading),
      across = -(w.valet.x - car.x) * Math.sin(car.heading) + (w.valet.z - car.z) * Math.cos(car.heading);
    expect(Math.abs(along) >= S.CAR_L / 2 + S.BODY - 1e-6 || Math.abs(across) >= S.CAR_W / 2 + S.BODY - 1e-6).toBe(true);
  });
});

describe("valet parking: getting in and out", () => {
  test("탑승 only next to a car the valet may take: a customer's car not yet parked, or one asked for; not a parked car, nor from afar", () => {
    const lot = S.lotOf(1),
      bay = lot.bays[4];
    // From afar: nothing.
    const far = standingBy(1, lot.entrance.x, 0, 0, 0, 0);
    expect(S.reachable(far)).toBeNull();
    expect(S.board(far)).toEqual([]);
    expect(far.hand).toBe(-1);
    // By its nose (within reach): in, and the customer names a bay.
    const near = standingBy(1, lot.entrance.x, 0, 0, lot.entrance.x + S.CAR_L / 2 + S.BODY + 0.5, 0);
    expect(S.reachable(near)?.id).toBe(1);
    const took = S.board(near);
    expect(took).toHaveLength(1);
    expect(took[0]).toMatchObject({ kind: "take", car: 1 });
    expect(near.hand).toBe(1);
    const car = S.carOf(near, 1)!;
    expect(car.taken).toBe(true);
    expect((took[0] as { bay: number }).bay).toBe(car.want);
    expect(S.freeBays(near)).toContain(car.want);
    // Already in: no second 탑승.
    expect(S.board(near)).toEqual([]);
    // A parked car is not to be taken until its owner asks for it.
    const parked = standingBy(1, bay.x, bay.z, bay.angle, bay.x, bay.z - Math.sign(bay.z) * (bay.l / 2 + 0.5), "parked");
    S.carOf(parked, 1)!.bay = 4;
    expect(S.board(parked)).toEqual([]);
    S.carOf(parked, 1)!.state = "requested";
    expect(S.board(parked)).toEqual([{ kind: "take", car: 1, bay: 4 }]);
  });
  test("each customer names one bay of those free, not one another customer has named; the same seed names the same", () => {
    const named = (seed: number) => {
      const w = S.createWorld(1, seed),
        lot = w.lot;
      w.nextArrival = 1e9;
      for (const [id, z] of [
        [1, 0],
        [2, 3],
      ])
        w.cars.push({ id, x: -9, z, heading: 0, v: 0, steer: 0, style: 0, colour: 0, state: "waiting", bay: -1, want: -1, taken: false, patience: 50, patience0: 50, late: false, bumped: false, dents: 0, t: 0, backAt: 0 });
      // Bays 0 to 11 are held by parked cars: two are left free.
      for (let k = 0; k < 12; k++) w.cars.push({ id: 10 + k, x: lot.bays[k].x, z: lot.bays[k].z, heading: lot.bays[k].angle, v: 0, steer: 0, style: 0, colour: 0, state: "parked", bay: k, want: k, taken: true, patience: 50, patience0: 50, late: false, bumped: false, dents: 0, t: 0, backAt: 1e9 });
      const wants: number[] = [];
      for (const z of [0, 3]) {
        w.hand = -1;
        Object.assign(w.valet, { x: -9 + S.CAR_L / 2 + 0.6, z });
        const e = S.board(w)[0] as { bay: number };
        wants.push(e.bay);
      }
      return wants;
    };
    const a = named(5);
    expect([...a].sort()).toEqual([12, 13]);
    expect(named(5)).toEqual(a);
    // Over many seeds, both orders come: the bay is drawn, not simply the first.
    const firsts = new Set([123457, 987651, 55555555, 77777, 31415926, 2718281, 1618033, 4242424].map((seed) => named(seed)[0]));
    expect(firsts.size).toBe(2);
  });
  test("하차 only when the car stands: rolling, the valet stays at the wheel; stopped in the aisle, it steps out by the door and the car is left there, still the customer's", () => {
    const w = holding(1, -2, 0, 0, "waiting", 3);
    run(w, 1, gas(1));
    const car = S.carOf(w, 1)!;
    expect(car.v).toBeGreaterThan(1);
    expect(S.canAlight(w)).toBe(false);
    expect(S.alight(w)).toEqual([]);
    expect(w.hand).toBe(1);
    run(w, 0.6, gas(0, 0, true));
    expect(car.v).toBe(0);
    expect(S.canAlight(w)).toBe(true);
    expect(S.alight(w)).toEqual([{ kind: "out", car: 1 }]);
    expect(w.hand).toBe(-1);
    expect(car.state).toBe("waiting");
    // Out by the driver's door: on the car's left, clear of it.
    const side = -(w.valet.x - car.x) * Math.sin(car.heading) + (w.valet.z - car.z) * Math.cos(car.heading);
    expect(side).toBeLessThan(-S.CAR_W / 2 - S.BODY + 1e-6);
    // In again: the same customer, the same bay.
    expect(S.board(w)).toEqual([{ kind: "take", car: 1, bay: 3 }]);
  });
  test("only the named bay counts: standing rightly in another free bay, or askew in its own, the valet is kept at the wheel and told", () => {
    const lot = S.lotOf(1),
      [mine, other] = [lot.bays[3], lot.bays[9]];
    const wrong = holding(1, other.x, other.z, other.angle, "waiting", 3);
    expect(S.bayAt(wrong, 1, other.x, other.z, other.angle)).toBe(9);
    expect(S.alight(wrong)).toEqual([{ kind: "wrong", car: 1, bay: 3, at: 9 }]);
    expect(wrong.hand).toBe(1);
    expect(S.carOf(wrong, 1)!.state).toBe("waiting");
    // Run as long as you like there: no parking.
    expect(run(wrong, 2).some((e) => e.kind === "parked")).toBe(false);
    const askew = holding(1, mine.x, mine.z, mine.angle + 0.5, "waiting", 3);
    expect(S.alight(askew)).toEqual([{ kind: "wrong", car: 1, bay: 3, at: 3 }]);
    expect(askew.hand).toBe(1);
    // Rightly in its own: parked, and the valet is out beside it.
    const right = holding(1, mine.x, mine.z, mine.angle, "waiting", 3);
    expect(parkIt(right)).toMatchObject({ kind: "parked", car: 1, bay: 3 });
    expect(right.hand).toBe(-1);
    expect(S.carOf(right, 1)!.state).toBe("parked");
  });
});

describe("valet parking: bays, pay and patience", () => {
  test("a car at rest inside its bay, along it, is parked and paid on 하차; askew or over the line, it is not; still rolling, the valet cannot get out", () => {
    const lot = S.lotOf(1),
      bay = lot.bays[3];
    const good = holding(1, bay.x, bay.z, bay.angle, "waiting", 3),
      parked = parkIt(good)!;
    expect(parked).toMatchObject({ kind: "parked", car: 1, bay: 3 });
    // Quick and dead straight: the whole pay, tip and tidy bonus.
    expect(parked).toMatchObject({ tip: S.TIP, tidy: S.TIDY, pay: S.PAY + S.TIP + S.TIDY });
    expect(S.carOf(good, 1)!.state).toBe("parked");
    expect(good.hand).toBe(-1);
    expect(S.freeBays(good)).not.toContain(3);
    // Nothing more comes of it afterwards (no second pay).
    expect(run(good, 1).some((e) => e.kind === "parked")).toBe(false);
    // Tail first counts the same.
    expect(parkIt(holding(1, bay.x, bay.z, bay.angle + Math.PI, "waiting", 3))).toBeTruthy();
    // Off to one side but inside the lines: parked, with less of the tidy bonus.
    expect(parkIt(holding(1, bay.x + 0.5, bay.z + 0.2, bay.angle + 0.15, "waiting", 3))!.tidy).toBeLessThan(S.TIDY);
    // Over the line, too far turned, or half out of the bay: not parked.
    for (const [dx, dz, da] of [
      [0.9, 0, 0],
      [0, 0, 0.5],
      [0, 1.6, 0],
    ])
      expect(parkIt(holding(1, bay.x + dx, bay.z + dz, bay.angle + da, "waiting", 3)), `${dx} ${dz} ${da}`).toBeUndefined();
    // Still rolling through it: the valet cannot get out.
    const rolling = holding(1, bay.x, bay.z + 2, bay.angle, "waiting", 3);
    S.carOf(rolling, 1)!.v = 1.5;
    expect(S.alight(rolling)).toEqual([]);
    // With no bay named (none was free), any free bay will do.
    expect(parkIt(holding(1, bay.x, bay.z, bay.angle, "waiting", -1))).toMatchObject({ bay: 3 });
    // A bay another car holds is not free: no parking there (the car cannot even stand in it).
    const taken = holding(1, bay.x, bay.z + 6, bay.angle);
    taken.cars.push({ ...S.carOf(taken, 1)!, id: 2, x: bay.x, z: bay.z, state: "parked", bay: 3, backAt: 1e9 });
    expect(S.freeBays(taken)).not.toContain(3);
    expect(S.bayAt(taken, 1, bay.x, bay.z, bay.angle)).toBe(-1);
  });
  test("a bump on the job loses its tips; a slow job gets a smaller tip", () => {
    const bay = S.lotOf(1).bays[2],
      bumped = holding(1, bay.x, bay.z, bay.angle, "waiting", 2);
    S.carOf(bumped, 1)!.bumped = true;
    expect(parkIt(bumped)).toMatchObject({ pay: S.PAY, tip: 0, tidy: 0 });
    const slow = holding(1, bay.x, bay.z, bay.angle, "waiting", 2);
    S.carOf(slow, 1)!.patience = S.carOf(slow, 1)!.patience0 / 3;
    const tip = parkIt(slow)!.tip;
    expect(tip).toBeGreaterThan(0);
    expect(tip).toBeLessThan(S.TIP * 0.4);
  });
  test("a parked car's owner comes back and asks for it; the valet gets in by it, drives it into the exit, and it is handed over and paid; its bay is free again and the valet is on foot by the exit", () => {
    const bay = S.lotOf(1).bays[0],
      w = holding(1, bay.x, bay.z, bay.angle, "waiting", 0);
    parkIt(w);
    const car = S.carOf(w, 1)!;
    expect(car.backAt).toBeGreaterThan(w.time + w.lot.stay[0] - 1);
    const asked = run(w, 60, S.IDLE, (e) => e.kind === "ask");
    expect(asked.find((e) => e.kind === "ask")).toEqual({ kind: "ask", car: 1, bay: 0 });
    expect(car.state).toBe("requested");
    // The valet does not go by itself: it is walked to the car (it got out beside it) and in.
    expect(w.hand).toBe(-1);
    expect(S.board(w)).toEqual([{ kind: "take", car: 1, bay: 0 }]);
    // Set in the aisle before the exit and driven in: no 하차 needed there.
    Object.assign(car, { x: w.lot.exit.x - 5, z: 0, heading: 0 });
    const seen = run(w, 4, gas(1), (e) => e.kind === "returned");
    expect(seen.at(-1)).toMatchObject({ kind: "returned", car: 1 });
    expect((seen.at(-1) as { pay: number }).pay).toBeGreaterThan(S.PAY);
    expect(S.freeBays(w)).toContain(0);
    expect(w.hand).toBe(-1);
    expect(Math.hypot(w.valet.x - w.lot.exit.x, w.valet.z - w.lot.exit.z)).toBeLessThan(5);
    run(w, 3);
    expect(car.state).toBe("gone");
  });
  test("customers come one at a time to the entrance and wait outside while it is taken; nobody runs to them by themselves", () => {
    const w = S.createWorld(1, 5),
      seen = run(w, 8);
    expect(seen.find((e) => e.kind === "arrive")).toEqual({ kind: "arrive", car: 1 });
    const car = S.carOf(w, 1)!;
    expect(car).toMatchObject({ x: w.lot.entrance.x, z: w.lot.entrance.z, heading: 0, state: "waiting", taken: false, want: -1 });
    expect(seen.some((e) => e.kind === "take")).toBe(false);
    expect(w.hand).toBe(-1);
    // Not driven away: the next customers wait outside, at most `QUEUE_MOST`, and none rolls in.
    run(w, 40);
    expect(w.cars.filter((c) => c.state === "queue").length).toBe(S.QUEUE_MOST);
    expect(w.cars.filter((c) => c.state === "waiting" || c.state === "arriving").length).toBe(1);
  });
  test("patience runs out: a customer whose car was never taken drives off, and it is told once; a car taken goes on for the late pay", () => {
    const w = S.createWorld(1, 5);
    w.nextArrival = 0;
    run(w, 3, S.IDLE, (e) => e.kind === "arrive");
    w.nextArrival = 1e9;
    const car = S.carOf(w, 1)!;
    car.patience = 0.5;
    const seen = run(w, 3);
    expect(seen.filter((e) => e.kind === "angry")).toEqual([{ kind: "angry", car: 1, left: true }]);
    expect(car.state === "leaving" || car.state === "gone").toBe(true);
    run(w, 3);
    expect(car.state).toBe("gone");
    expect(car.x).toBeLessThan(w.lot.minX);
    // In hand when its patience runs out: told, kept, and parked for the late pay.
    const bay = w.lot.bays[1],
      held = holding(1, bay.x, bay.z + 6, bay.angle, "waiting", 1);
    S.carOf(held, 1)!.patience = 0.2;
    expect(run(held, 1).filter((e) => e.kind === "angry")).toEqual([{ kind: "angry", car: 1, left: false }]);
    Object.assign(S.carOf(held, 1)!, { x: bay.x, z: bay.z });
    expect(parkIt(held)).toMatchObject({ pay: S.LATE_PAY, tip: 0, tidy: 0 });
    // Left standing in the aisle after it was taken: the customer stays to the end (late), the car does not drive off.
    const left = holding(1, 0, 0, 0, "waiting", 1);
    S.alight(left);
    S.carOf(left, 1)!.patience = 0.2;
    expect(run(left, 1).filter((e) => e.kind === "angry")).toEqual([{ kind: "angry", car: 1, left: false }]);
    expect(S.carOf(left, 1)!.state).toBe("waiting");
  });
});

describe("valet parking: the shift", () => {
  /**
   * A whole shift worked by the careful valet (by a lever and a wheel, or by keys: eight ways on foot, full lock or
   * none at the wheel): on foot to the customer with the least patience left and in, every car left with me into its
   * named bay and out, every car asked for to the exit.
   */
  function shift(stage: number, seed: number, keys: boolean) {
    const w = S.createWorld(stage, seed),
      lot = w.lot,
      log: string[] = [];
    let money = 0,
      mem: Parameters<typeof driver>[2] = {},
      foot: Parameters<typeof driver>[2] = {},
      job = -1,
      target = -1,
      goal: Parameters<typeof driver>[1] | null = null;
    const tally = { parked: 0, returned: 0, bumps: 0, angry: 0, wrong: 0, walked: 0 };
    const eight = (x: number) => (x > 0.38 ? 1 : x < -0.38 ? -1 : 0);
    for (let k = 0; k < (S.SHIFT + 1) / S.DT; k++) {
      let input = S.IDLE;
      const events: S.Happening[] = [],
        car = w.hand >= 0 ? S.carOf(w, w.hand)! : null;
      if (!car) {
        job = -1;
        let to = S.jobs(w).find((c) => c.id === target);
        if (!to) {
          to = S.jobs(w).sort((a, b) => a.patience / a.patience0 - b.patience / b.patience0)[0];
          target = to ? to.id : -1;
          foot = { out: foot.out };
        }
        if (to && S.reachable(w)?.id === target) events.push(...S.board(w));
        else if (to) {
          const bay = to.state === "requested" ? lot.bays[to.bay] : null,
            d = driver({ x: w.valet.x, z: w.valet.z, heading: 0, v: 0 }, { kind: "walk", x: to.x, z: to.z, angle: to.heading, from: bay ? { x: bay.x, z: bay.z, angle: bay.angle } : null }, foot);
          const [x, z] = keys ? [eight(d.walkX), eight(d.walkZ)] : [d.walkX, d.walkZ],
            far = Math.hypot(x, z) || 1;
          input = { gas: 0, steer: 0, handbrake: false, walkX: x / far, walkZ: z / far };
          tally.walked += S.DT;
        }
      } else {
        target = -1;
        if (job !== car.id) {
          job = car.id;
          mem = {};
          const bay = car.state === "waiting" ? lot.bays[car.want >= 0 ? car.want : S.freeBays(w)[0]] : lot.bays[car.bay];
          goal = car.state === "waiting" ? (bay ? { kind: "bay", x: bay.x, z: bay.z, angle: bay.angle } : null) : { kind: "exit", x: lot.exit.x, z: lot.exit.z, angle: 0, from: bay ? { x: bay.x, z: bay.z, angle: bay.angle } : null };
        }
        if (goal) {
          const d = driver(car, goal, mem);
          input = keys ? { gas: d.gas, steer: d.steer > 0.3 ? 1 : d.steer < -0.3 ? -1 : 0, handbrake: d.handbrake } : d;
          if (goal.kind === "bay" && mem.phase === 1 && Math.abs(car.v) < 0.02) {
            const a = Math.sin(goal.angle) * goal.z >= 0 ? goal.angle : goal.angle + Math.PI;
            foot = { out: { x: -Math.cos(a), z: -Math.sin(a) } };
            events.push(...S.alight(w));
          }
        }
      }
      events.push(...S.step(w, input));
      for (const e of events) {
        log.push(`${k} ${JSON.stringify(e)}`);
        if (e.kind === "parked") [tally.parked, money] = [tally.parked + 1, money + e.pay];
        else if (e.kind === "returned") [tally.returned, money] = [tally.returned + 1, money + e.pay];
        else if (e.kind === "bump" && e.fined) [tally.bumps, money] = [tally.bumps + 1, money - S.BUMP_FINE];
        else if (e.kind === "angry") [tally.angry, money] = [tally.angry + 1, money - S.ANGRY_FINE];
        else if (e.kind === "wrong") tally.wrong++;
      }
    }
    if (process.env.VALET_LOG) console.log(stage, seed, keys, JSON.stringify(tally), money, "\n" + log.filter((l) => !l.includes('"bump"') || l.includes("true")).join("\n"));
    return { w, log, money, ...tally };
  }
  test("a careful valet works a whole shift in the first lot, by a lever and a wheel or by keys: walked to each car, cars parked in their named bays and handed back, hardly a bump, money made", () => {
    for (const keys of [false, true]) {
      const s = shift(1, 7, keys);
      expect(s.w.over).toBe(true);
      expect(s.log.at(-1)).toContain('"end"');
      expect(s.parked, `${keys}`).toBeGreaterThanOrEqual(6);
      expect(s.returned, `${keys}`).toBeGreaterThanOrEqual(3);
      expect(s.wrong).toBe(0);
      expect(s.bumps).toBeLessThanOrEqual(1);
      expect(s.angry).toBeLessThanOrEqual(1);
      expect(s.money).toBeGreaterThan(300);
      expect(s.walked).toBeGreaterThan(10);
      // Every car was parked in the bay its customer named.
      for (const line of s.log.filter((l) => l.includes('"parked"'))) {
        const e = JSON.parse(line.slice(line.indexOf(" ") + 1));
        expect(S.carOf(s.w, e.car)!.want).toBe(e.bay);
      }
    }
  });
  test("slanted bays are walked to and driven into as well", () => {
    const s = shift(2, 7, false);
    expect(s.parked).toBeGreaterThanOrEqual(5);
    expect(s.returned).toBeGreaterThanOrEqual(2);
    expect(s.wrong).toBe(0);
    expect(s.bumps).toBeLessThanOrEqual(1);
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
    expect(S.board(a.w)).toEqual([]);
    expect(S.alight(a.w)).toEqual([]);
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
