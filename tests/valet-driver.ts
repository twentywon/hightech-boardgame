/**
 * A careful driver for the valet's tests: a pure function of the car's place and what it is to do, with no imports
 * and nothing from outside itself (the browser test hands its text to the page and drives by keys with it).
 *
 * `goal.kind` "bay": from the aisle (the lot's middle line, z = 0) nose first into a bay square or slanted to it.
 * `goal.kind` "exit": out of the bay `goal.from` (backing straight, then backing round to face the exit), or from
 * anywhere in the aisle, along the aisle to the exit.
 * `mem` is the driver's memory between calls (start it as `{}`).
 */
export function driver(
  car: { x: number; z: number; heading: number; v: number },
  goal: { kind: string; x: number; z: number; angle: number; from?: { x: number; z: number; angle: number } | null },
  mem: { phase?: number; side?: number },
) {
  const wrap = (a: number) => {
      let b = a % (2 * Math.PI);
      if (b > Math.PI) b -= 2 * Math.PI;
      if (b <= -Math.PI) b += 2 * Math.PI;
      return b;
    },
    clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
    LOCK = 0.62,
    out = { gas: 0, steer: 0, handbrake: false },
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
 * The careful driver at the wheel of the page's car, by keys alone: run inside the page (handed over whole, with the
 * driver's own text as `source`), it reads where things stand from the canvas's `data-*` attributes frame by frame
 * and holds the arrow keys and Space as the driver says: every car left at the entrance into the first free bay, and
 * every car asked for out of its bay to the exit.
 */
export function atTheWheel(source: string) {
  const drive = new Function(`return (${source})`)() as typeof driver,
    board = document.querySelector<HTMLCanvasElement>("#board canvas")!,
    held: Record<string, boolean> = {},
    set = (key: string, on: boolean) => {
      if (!!held[key] === on) return;
      held[key] = on;
      board.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { key, bubbles: true, cancelable: true }));
    };
  let job = "",
    mem = {},
    goal: Parameters<typeof driver>[1] | null = null;
  const loop = () => {
    if (!board.isConnected) return;
    const d = board.dataset;
    let o = { gas: 0, steer: 0, handbrake: false };
    if (d.phase === "drive" && d.car) {
      const [x, z, heading, v] = d.car.split(",").map(Number);
      if (job !== d.job) {
        job = d.job!;
        mem = {};
        if (job === "waiting") {
          const bay = JSON.parse(d.free!)[0];
          goal = bay ? { kind: "bay", x: bay[1], z: bay[2], angle: bay[3] } : null;
        } else {
          const [ex, ez] = d.exit!.split(",").map(Number),
            from = d.from ? d.from.split(",").map(Number) : null;
          goal = { kind: "exit", x: ex, z: ez, angle: 0, from: from ? { x: from[0], z: from[1], angle: from[2] } : null };
        }
      }
      if (goal) o = drive({ x, z, heading, v }, goal, mem);
    } else job = "";
    set("ArrowUp", o.gas > 0);
    set("ArrowDown", o.gas < 0);
    set("ArrowRight", o.steer > 0.3);
    set("ArrowLeft", o.steer < -0.3);
    set(" ", o.handbrake);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
