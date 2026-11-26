/**
 * A careful driver for the valet's tests: a pure function of the car's place and what it is to do, with no imports
 * and nothing from outside itself (the browser test hands its text to the page and drives by keys with it).
 *
 * `goal.kind` "bay": from the aisle (the lot's middle line, z = 0) nose first into a bay square or slanted to it.
 * `goal.kind` "exit": out of the bay `goal.from` (backing straight, then backing round to face the exit), or from
 * anywhere in the aisle, along the aisle to the exit.
 * `goal.kind` "walk": the valet on foot (`car` is the valet) to the car at (x, z) pointing at `angle`: out of a row of
 * bays first if `mem.out` says which way (the way out of the bay it has just parked in), along the aisle to the mouth of the
 * bay `goal.from` the car stands in (or before the nose of a car not in a bay), then straight to it. What it says is
 * `walkX`, `walkZ`, a lever's lean.
 * `mem` is the driver's memory between calls (start it as `{}`).
 */
export function driver(
  car: { x: number; z: number; heading: number; v: number },
  goal: { kind: string; x: number; z: number; angle: number; from?: { x: number; z: number; angle: number } | null },
  mem: { phase?: number; side?: number; out?: { x: number; z: number } | null; at?: boolean },
) {
  const wrap = (a: number) => {
      let b = a % (2 * Math.PI);
      if (b > Math.PI) b -= 2 * Math.PI;
      if (b <= -Math.PI) b += 2 * Math.PI;
      return b;
    },
    clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
    LOCK = 0.62,
    out = { gas: 0, steer: 0, handbrake: false, walkX: 0, walkZ: 0 },
    // Steers along the line through (lx, lz) at angle `a`; `back` when the car is backing along it.
    follow = (lx: number, lz: number, a: number, gain = 0.9) => {
      const off = -(car.x - lx) * Math.sin(a) + (car.z - lz) * Math.cos(a),
        turn = wrap(a - car.heading) - Math.atan2(gain * off, 1 + Math.abs(car.v));
      out.steer = clamp(turn / LOCK, -1, 1);
    },
    hold = (speed: number) => {
      if (car.v < speed - 0.15) out.gas = 1;
      else if (car.v > speed + 0.8) out.handbrake = true;
    };
  if (goal.kind === "walk") {
    const lead = (x: number, z: number) => {
        const far = Math.hypot(x, z) || 1;
        out.walkX = x / far;
        out.walkZ = z / far;
      },
      into = (b: { x: number; z: number; angle: number }) => (Math.sin(b.angle) * b.z >= 0 ? b.angle : b.angle + Math.PI),
      a = goal.from ? into(goal.from) : goal.angle,
      // The aisle's place to make for: a bay's mouth, or before a car's nose.
      ax = goal.from ? goal.from.x - Math.cos(a) * 3.2 : goal.x + Math.cos(a) * 2.9,
      az = goal.from ? goal.from.z - Math.sin(a) * 3.2 : goal.z + Math.sin(a) * 2.9;
    if (Math.abs(car.z) <= 3.6) mem.out = null;
    if (mem.out && !mem.at) lead(mem.out.x, mem.out.z);
    else if (!mem.at && Math.hypot(ax - car.x, az - car.z) > 0.45) lead(ax - car.x, az - car.z);
    else {
      mem.at = true;
      lead(goal.x - car.x, goal.z - car.z);
    }
    return out;
  }
  if (goal.kind === "bay") {
    // Into the bay the way that leads away from the aisle.
    const a = Math.sin(goal.angle) * goal.z >= 0 ? goal.angle : goal.angle + Math.PI,
      lane = -Math.sign(goal.z) * 1.7,
      turn = Math.abs(wrap(a)),
      meet = goal.x + ((lane - goal.z) * Math.cos(a)) / Math.sin(a),
      from = meet - 4.9 * Math.tan(turn / 2);
    mem.phase ??= 0;
    if (mem.phase === 0) {
      // Along the aisle on its far side, slowing for the turn.
      follow(car.x, lane, 0, 0.7);
      hold(from - car.x > 7 ? 5 : from - car.x > 3 ? 3.4 : 2.4);
      if (car.x >= from) mem.phase = 1;
    }
    if (mem.phase === 1) {
      const left = (goal.x - car.x) * Math.cos(a) + (goal.z - car.z) * Math.sin(a);
      follow(goal.x, goal.z, a, 1.2);
      if (left <= 0.12 + (car.v * car.v) / 26) out.handbrake = true;
      else hold(left > 3 ? 2.2 : 1.3);
    }
    return out;
  }
  const from = goal.from;
  mem.phase ??= from ? 0 : 2;
  if (from && mem.phase === 0) {
    // Straight back out of the bay until the nose is clear of the cars beside it.
    const a = Math.sin(from.angle) * from.z >= 0 ? from.angle : from.angle + Math.PI,
      backed = -((car.x - from.x) * Math.cos(a) + (car.z - from.z) * Math.sin(a)),
      nose = wrap(car.heading - a);
    mem.side ??= Math.abs(nose) < Math.PI / 2 ? 1 : -1;
    // A car parked nose first backs out; one parked tail first drives out.
    const need = 3.1 / Math.max(0.5, Math.abs(Math.sin(a)));
    if (backed >= need) mem.phase = 1;
    else {
      if (mem.side > 0) {
        if (car.v > -1.6) out.gas = -1;
      } else if (car.v < 1.6) out.gas = 1;
      return out;
    }
  }
  if (mem.phase === 1) {
    // Round to face the exit: backing with the wheels turned so that the tail swings toward the entrance; a car that
    // came out nose first simply turns toward the exit.
    const off = wrap(0 - car.heading);
    if (Math.abs(off) < 0.2 || (mem.side ?? 1) < 0) mem.phase = 2;
    else {
      out.steer = off > 0 ? -1 : 1;
      if (car.v > -1.5) out.gas = -1;
      return out;
    }
  }
  // Along the aisle to the exit.
  if (car.v < -0.05) {
    out.handbrake = true;
    return out;
  }
  follow(goal.x, goal.z, 0, 0.6);
  hold(Math.abs(wrap(car.heading)) > 0.5 ? 2 : 4.5);
  return out;
}

/**
 * The careful valet at work in the page, by keys alone: run inside the page (handed over whole, with the driver's own
 * text as `source`), it reads where things stand from the canvas's `data-*` attributes frame by frame and holds the
 * arrow keys and Space, and presses E, as the driver says: on foot to the customer with the least patience left and
 * in (E), every car left with me into the bay its customer named and out (E), and every car asked for out of its bay
 * to the exit.
 */
export function atTheWheel(source: string) {
  const drive = new Function(`return (${source})`)() as typeof driver,
    board = document.querySelector<HTMLCanvasElement>("#board canvas")!,
    held: Record<string, boolean> = {},
    set = (key: string, on: boolean) => {
      if (!!held[key] === on) return;
      held[key] = on;
      board.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { key, bubbles: true, cancelable: true }));
    },
    press = () => {
      // (The keys held are let go first: the valet getting in or out lets go of them too.)
      for (const key of Object.keys(held)) set(key, false);
      board.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true, cancelable: true }));
      board.dispatchEvent(new KeyboardEvent("keyup", { key: "e", bubbles: true, cancelable: true }));
    };
  let job = "",
    mem: Parameters<typeof driver>[2] = {},
    walk: Parameters<typeof driver>[2] = {},
    target = -1,
    wait = 0,
    goal: Parameters<typeof driver>[1] | null = null;
  const loop = () => {
    if (!board.isConnected) return;
    const d = board.dataset;
    let o = { gas: 0, steer: 0, handbrake: false, walkX: 0, walkZ: 0 };
    wait = Math.max(0, wait - 1);
    if (d.phase === "walk" && d.valet) {
      job = "";
      const [x, z] = d.valet.split(",").map(Number),
        takes = JSON.parse(d.takes || "[]") as [number, number, number, number, string, number, number[] | null][];
      let car = takes.find((t) => t[0] === target);
      if (!car) {
        car = takes.slice().sort((a, b) => a[5] - b[5])[0];
        target = car ? car[0] : -1;
        walk = { out: walk.out };
      }
      if (car && Number(d.near) === target && !wait) {
        press();
        wait = 6;
      } else if (car) o = drive({ x, z, heading: 0, v: 0 }, { kind: "walk", x: car[1], z: car[2], angle: car[3], from: car[6] ? { x: car[6][0], z: car[6][1], angle: car[6][2] } : null }, walk);
    } else if (d.phase === "drive" && d.car) {
      target = -1;
      const [x, z, heading, v] = d.car.split(",").map(Number);
      if (job !== d.job) {
        job = d.job!;
        mem = {};
        if (job === "waiting") {
          const bay = d.want ? JSON.parse(d.want) : null;
          goal = bay ? { kind: "bay", x: bay[1], z: bay[2], angle: bay[3] } : null;
        } else {
          const [ex, ez] = d.exit!.split(",").map(Number),
            from = d.from ? d.from.split(",").map(Number) : null;
          goal = { kind: "exit", x: ex, z: ez, angle: 0, from: from ? { x: from[0], z: from[1], angle: from[2] } : null };
        }
      }
      if (goal) o = drive({ x, z, heading, v }, goal, mem);
      // Stopped in its bay: out (and the way back to the aisle is the way into the bay, reversed).
      if (goal?.kind === "bay" && mem.phase === 1 && Math.abs(v) < 0.02 && !wait) {
        const a = Math.sin(goal.angle) * goal.z >= 0 ? goal.angle : goal.angle + Math.PI;
        walk = { out: { x: -Math.cos(a), z: -Math.sin(a) } };
        press();
        wait = 6;
      }
    } else job = "";
    const on = d.phase === "walk";
    set("ArrowUp", on ? o.walkZ < -0.38 : o.gas > 0);
    set("ArrowDown", on ? o.walkZ > 0.38 : o.gas < 0);
    set("ArrowRight", on ? o.walkX > 0.38 : o.steer > 0.3);
    set("ArrowLeft", on ? o.walkX < -0.38 : o.steer < -0.3);
    set(" ", !on && o.handbrake);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
