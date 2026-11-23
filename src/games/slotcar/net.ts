import { pack, type Control } from "../../net/live";
import { autopilot, type Flight, type Level, type World } from "./sim";
import { laneLength } from "./track";

/**
 * The slot car track over one Wi-Fi (와이파이 여럿이): what the host's race and a guest's pedal are as numbers
 * (`src/net/live.ts`), the host's throttles for every car (a hand, a guest's pedal or the computer), and a guest's
 * world laid from two of the host's states. Free of Three.js and the page, so that the tests run a host and its guests
 * with it.
 *
 * The host's state: the race clock (its tick and the tick it closed), then for every car how far it is into its lap
 * along its lane, its laps, speed, how far its tail is out, whether it is in its slot, off or home, its flights off,
 * its place home, its pedal, and its tumble when it is off. A guest's controls: its pedal, 1 held or 0.
 */
const HEAD = 3,
  CAR = 15;
const PHASES = ["slot", "off", "done"] as const;
export interface CarSnap {
  along: number;
  laps: number;
  v: number;
  slide: number;
  phase: (typeof PHASES)[number];
  offs: number;
  place: number | null;
  throttle: boolean;
  off: Flight | null;
}
export interface Snap {
  tick: number;
  closed: number | null;
  cars: CarSnap[];
}
/** One lap of a lane, along it. */
export const lapOf = (world: World, lane: number) => world.track.segments.reduce((sum, seg) => sum + laneLength(seg, world.track.offsets[lane]), 0);
/** How far a car is into its lap, along its own lane. */
export function alongOf(world: World, k: number) {
  const car = world.cars[k],
    d = world.track.offsets[car.lane];
  let sum = car.u;
  for (let i = 0; i < car.seg; i++) sum += laneLength(world.track.segments[i], d);
  return sum;
}
/** Puts a car `along` its lap (its segment and the way through it). */
function setAlong(world: World, k: number, along: number) {
  const car = world.cars[k],
    { segments, offsets } = world.track,
    d = offsets[car.lane];
  let seg = 0,
    u = Math.max(0, along);
  while (seg < segments.length - 1 && u >= laneLength(segments[seg], d)) u -= laneLength(segments[seg++], d);
  car.seg = seg;
  car.u = Math.min(u, laneLength(segments[seg], d));
}
export function snapOf(world: World): number[] {
  const out = [world.tick, world.closed ?? -1, world.cars.length];
  world.cars.forEach((car, k) => {
    const f = car.off;
    out.push(
      ...pack([alongOf(world, k)]),
      car.laps,
      ...pack([car.v, car.slide]),
      PHASES.indexOf(car.phase),
      car.offs,
      car.place ?? -1,
      car.throttle ? 1 : 0,
      ...pack(f ? [f.x, f.y, f.h, f.yaw, f.roll, f.pitch, f.t] : [0, 0, 0, 0, 0, 0, -1]),
    );
  });
  return out;
}
export function readSnap(data: number[]): Snap | null {
  const n = data[2];
  if (!Number.isInteger(n) || n < 2 || n > 4 || data.length !== HEAD + CAR * n) return null;
  const cars: CarSnap[] = [];
  for (let k = 0; k < n; k++) {
    const [along, laps, v, slide, phase, offs, place, throttle, x, y, h, yaw, roll, pitch, t] = data.slice(HEAD + CAR * k, HEAD + CAR * (k + 1));
    if (!PHASES[phase]) return null;
    cars.push({
      along,
      laps,
      v,
      slide,
      phase: PHASES[phase],
      offs,
      place: place >= 0 ? place : null,
      throttle: throttle > 0,
      off: t >= 0 ? { x, y, h, yaw, roll, pitch, t, vx: 0, vy: 0, vh: 0, spin: 0, rollRate: 0, pitchRate: 0 } : null,
    });
  }
  return { tick: data[0], closed: data[1] >= 0 ? data[1] : null, cars };
}
/** A guest's pedal as sent. */
export const inputOf = (held: boolean) => [held ? 1 : 0];
/** A guest's pedal read back on the host (nothing heard yet: let go). */
export const readInput = (data: number[] | null) => !!data && data.length >= 1 && data[0] > 0.5;
/**
 * The host's throttle for every car: the car of the seat this device plays by its pedal (`mine`), a guest's by what it
 * last sent, the computer's (or a guest's away from the room) by `autopilot`. `seats` is the seat of each car.
 */
export function hostThrottles(world: World, seats: number[], control: (seat: number) => Control, input: (seat: number) => number[] | null, mine: boolean, level: Level) {
  return world.cars.map((_, k) => {
    const who = control(seats[k]);
    return who === "me" ? mine : who === "remote" ? readInput(input(seats[k])) : who === "computer" ? autopilot(world, k, level) : false;
  });
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/**
 * A guest's world as the host's was `t` of the way from state `a` to state `b`: each car along its lane (across its
 * line into the next lap when it crossed it between them), its speed and its tail, its tumble while it is off; the
 * race clock; and the order home. What is counted (laps, flights off, places, the pedal) is the later state's.
 */
export function follow(world: World, a: Snap, b: Snap, t: number) {
  if (a.cars.length !== world.cars.length || b.cars.length !== world.cars.length) return;
  world.tick = Math.round(mix(a.tick, b.tick, t));
  world.closed = b.closed;
  world.cars.forEach((car, k) => {
    const A = a.cars[k],
      B = b.cars[k],
      lap = lapOf(world, car.lane),
      crossed = B.along < A.along - lap / 2,
      raw = mix(A.along, B.along + (crossed ? lap : 0), t);
    car.laps = crossed && raw < lap ? A.laps : B.laps;
    setAlong(world, k, raw % lap);
    car.v = mix(A.v, B.v, t);
    car.slide = mix(A.slide, B.slide, t);
    car.phase = B.phase;
    car.offs = B.offs;
    car.place = B.place;
    car.throttle = B.throttle;
    // The same flight in both: drawn between them; one just begun, as told.
    const fa = A.off,
      fb = B.off;
    car.off = fb && fa && A.offs === B.offs ? { ...fb, x: mix(fa.x, fb.x, t), y: mix(fa.y, fb.y, t), h: mix(fa.h, fb.h, t), yaw: mix(fa.yaw, fb.yaw, t), roll: mix(fa.roll, fb.roll, t), pitch: mix(fa.pitch, fb.pitch, t), t: mix(fa.t, fb.t, t) } : fb ? { ...fb } : null;
  });
  world.order = world.cars
    .map((car, k) => ({ k, place: car.place }))
    .filter((c) => c.place !== null)
    .sort((x, y) => x.place! - y.place!)
    .map((c) => c.k);
}
