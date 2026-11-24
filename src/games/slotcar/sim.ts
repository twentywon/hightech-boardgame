/**
 * A slot car race, free of Three.js and the page. The view steps it in fixed slices of `DT`, giving each car's
 * throttle (pedal held or not) as its only input, so that a race run twice with the same throttles is the same race
 * (and a race over Wi-Fi could later be run alike on every device). The computer's drivers decide their throttle by
 * `autopilot` from the world alone, drawing what they misjudge from the world's own seeded stream.
 *
 * A car runs along its lane: the pedal held, the motor pulls it toward its top speed; let go, it coasts and the
 * controller brakes it. Through a curve the slot holds it while the sideways pull v²/r stays within the grip; beyond
 * that the tail steps out (`slide`), and if it goes on too long, or the pull is far too much at once, the car
 * flies off the track tumbling. After a short penalty a marshal sets it back in its slot where it left.
 */
import { buildTrack, gripOf, laneAt, laneLength, laneRadius, safeSpeed, type Pose, type Track } from "./track";

export const DT = 1 / 120;
/** The car's top speed, how hard the motor pulls from rest, and how hard a car slows with the pedal let go. */
export const VMAX = 11,
  ACCEL = 15,
  BRAKE = 10,
  DRAG = 0.3;
/**
 * How fast the tail steps out per unit of pull beyond the grip (counted up to `PULL_CAP`), how fast it comes back, and
 * the pull that de-slots at once. The user found cars flew off too soon: a curve taken too fast now first screeches and
 * slides (the screech starts a little below the grip, `SCREECH_FROM`), and the car flies off only if the pedal stays
 * down (about 0.45 s at the most, seconds when only a little over), or at once only far beyond the grip (about 1.9 times the safe speed, a hairpin
 * taken flat out). Straights never throw a car off.
 */
export const SLIDE_RATE = 1.7,
  PULL_CAP = 1.3,
  RECOVER = 2.6,
  HARD = 2.5,
  SCREECH_FROM = -0.12;
/** Seconds of the start lights, of a car's flight off the track, of the marshal setting it back, and of the wait after the first car home. */
export const COUNTDOWN = 3,
  FLY = 1.3,
  MARSHAL = 0.8,
  WAIT = 8;
/** A car's length as drawn (its nose leads `u` by half of it, so that the grid stands behind the line). */
export const CAR_LENGTH = 0.78;
export const ticks = (seconds: number) => Math.round(seconds / DT);
/** The computer's drivers by level: how near the grip they aim to take a curve, how far that judgement strays, how late they brake. */
export const LEVELS = {
  easy: { aim: 0.9, stray: 0.45, late: 1.8, react: 0.45 },
  normal: { aim: 0.93, stray: 0.15, late: 1.4, react: 0.3 },
  hard: { aim: 0.98, stray: 0.02, late: 1, react: 0.18 },
};
export type Level = keyof typeof LEVELS;
export interface Flight {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  yaw: number;
  spin: number;
  roll: number;
  rollRate: number;
  pitch: number;
  pitchRate: number;
  /** Seconds since it left the slot. */
  t: number;
}
export interface Car {
  lane: number;
  /** The segment it is in and how far along its lane through it. */
  seg: number;
  u: number;
  laps: number;
  v: number;
  /** How far the tail has stepped out (1 flies off). */
  slide: number;
  phase: "slot" | "off" | "done";
  off: Flight | null;
  /** The tick it crossed the line for the last time, its finishing place (from 0), its flights off. */
  finish: number | null;
  place: number | null;
  offs: number;
  /** The tick its current lap began, and its best lap in ticks. */
  lapStart: number;
  best: number | null;
  /** The pedal as last applied. */
  throttle: boolean;
}
export interface World {
  track: Track;
  laps: number;
  cars: Car[];
  tick: number;
  /** The tick the race was closed (everyone home, or the wait after the first car ran out); null while it runs. */
  closed: number | null;
  /** The cars in the order they came home. */
  order: number[];
  /** The drivers' judgement of each segment for each car (a factor on its safe speed), drawn anew each lap. */
  judge: number[][];
  /** When each computer driver reacts to the green light. */
  react: number[];
  seed: number;
}
export type RaceEvent =
  | { kind: "go" }
  | { kind: "light"; n: number }
  | { kind: "lap"; car: number }
  | { kind: "off"; car: number; speed: number }
  | { kind: "back"; car: number }
  | { kind: "end"; ranking: number[] };
/** The world's own stream of chance (mulberry32), so that a race is the same each time it is run with the same seed. */
function draw(world: World) {
  world.seed = (world.seed + 0x6d2b79f5) | 0;
  let t = world.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** A race of `cars` cars, one to a lane, over `laps` laps of `course`; `level` is the computer drivers'. */
export function createWorld(course: string, cars: number, laps: number, level: Level = "normal", seed = 1): World {
  const track = buildTrack(course, cars),
    world: World = { track, laps, cars: [], tick: 0, closed: null, order: [], judge: [], react: [], seed: seed | 0 };
  for (let k = 0; k < cars; k++) {
    world.cars.push({ lane: k, seg: 0, u: 0, laps: 0, v: 0, slide: 0, phase: "slot", off: null, finish: null, place: null, offs: 0, lapStart: ticks(COUNTDOWN), best: null, throttle: false });
    world.judge.push([]);
    world.react.push(ticks(COUNTDOWN + LEVELS[level].react * (0.5 + draw(world))));
    rejudge(world, k, level);
  }
  return world;
}
/** A driver's judgement of every curve for the coming lap. */
function rejudge(world: World, car: number, level: Level) {
  const skill = LEVELS[level];
  world.judge[car] = world.track.segments.map(() => skill.aim * (1 + (draw(world) * 2 - 1) * skill.stray));
}
/** Whether the green light is on. */
export const racing = (world: World) => world.tick >= ticks(COUNTDOWN) && world.closed === null;
/** How far a car has come, along the middle line, from the start: laps and the way into this one. */
export function progress(world: World, k: number) {
  const car = world.cars[k],
    seg = world.track.segments[car.seg],
    d = world.track.offsets[car.lane];
  return car.laps * world.track.length + seg.start + (car.u / laneLength(seg, d)) * seg.length;
}
/** Every car by its place in the race: those home in their order, then the rest by how far they have come. */
export function ranking(world: World) {
  const rest = world.cars
    .map((_, k) => k)
    .filter((k) => world.cars[k].place === null)
    .sort((a, b) => progress(world, b) - progress(world, a) || a - b);
  return [...world.order, ...rest];
}
/** The pose of a car's lane at a place `back` units behind where the car is (its body is drawn round its middle). */
export function poseOf(world: World, k: number, back = 0): Pose {
  const car = world.cars[k],
    { segments, offsets } = world.track,
    d = offsets[car.lane];
  let seg = car.seg,
    u = car.u - back;
  while (u < 0) {
    seg = (seg + segments.length - 1) % segments.length;
    u += laneLength(segments[seg], d);
  }
  const length = laneLength(segments[seg], d);
  while (u > length) u -= length;
  return laneAt(segments[seg], u / length, d);
}
/** The car leaves its slot: it flies on the way it was going and out of the curve, turning over. */
function deslot(world: World, k: number) {
  const car = world.cars[k],
    seg = world.track.segments[car.seg],
    pose = poseOf(world, k, CAR_LENGTH / 2),
    out = -Math.sign(seg.turn || 1) * (0.35 + 0.25 * draw(world)),
    speed = car.v * 0.8,
    way = pose.heading + out;
  car.off = {
    x: pose.x,
    y: pose.y,
    h: pose.h,
    vx: Math.cos(way) * speed,
    vy: Math.sin(way) * speed,
    vh: 1.4 + 0.12 * car.v,
    yaw: pose.heading,
    spin: -Math.sign(seg.turn || 1) * (4 + 5 * draw(world)),
    roll: 0,
    rollRate: -Math.sign(seg.turn || 1) * (6 + 6 * draw(world)),
    pitch: 0,
    pitchRate: (draw(world) - 0.5) * 6,
    t: 0,
  };
  car.phase = "off";
  car.offs++;
  car.slide = 0;
}
const G = 14;
/** A car in the air or tumbling on the table: falling, bouncing low, sliding to rest and settling on a side. */
function fly(off: Flight) {
  off.t += DT;
  off.vh -= G * DT;
  off.x += off.vx * DT;
  off.y += off.vy * DT;
  off.h += off.vh * DT;
  off.yaw += off.spin * DT;
  off.roll += off.rollRate * DT;
  off.pitch += off.pitchRate * DT;
  if (off.h <= 0) {
    off.h = 0;
    off.vh = Math.abs(off.vh) > 1 ? -off.vh * 0.3 : 0;
    // On the table it rubs to rest and lies down on whichever side it fell nearest.
    const rub = Math.max(0, 1 - 4 * DT);
    off.vx *= rub;
    off.vy *= rub;
    off.spin *= Math.max(0, 1 - 5 * DT);
    off.rollRate *= Math.max(0, 1 - 7 * DT);
    off.pitchRate *= Math.max(0, 1 - 7 * DT);
    if (Math.abs(off.rollRate) < 2) off.roll += (Math.round(off.roll / (Math.PI / 2)) * (Math.PI / 2) - off.roll) * Math.min(1, 6 * DT);
    if (Math.abs(off.pitchRate) < 2) off.pitch += -off.pitch * Math.min(1, 6 * DT);
  }
}
/**
 * How near car k is to flying off, 0 to 1, for its tyres' screech: from a little below the grip of the curve it is in
 * (`SCREECH_FROM`) it rises with the pull and with how far the tail has stepped out; 0 on a straight or out of its slot.
 */
export function strain(world: World, k: number): number {
  const car = world.cars[k];
  if (car.phase !== "slot") return 0;
  const seg = world.track.segments[car.seg];
  if (seg.kind !== "curve") return Math.min(1, car.slide);
  const pull = (car.v * car.v) / laneRadius(seg, world.track.offsets[car.lane]) / gripOf(seg) - 1;
  return Math.min(1, Math.max(0, (pull - SCREECH_FROM) / 0.5, car.slide));
}
/**
 * One slice of the race. `throttle[k]` is car k's pedal. Returns what happened in it: the lights, laps, a car flying
 * off or put back, and the end of the race with every car's place.
 */
export function step(world: World, throttle: boolean[], level: Level = "normal"): RaceEvent[] {
  const events: RaceEvent[] = [],
    { track } = world,
    { segments, offsets } = track;
  if (world.closed !== null) return events;
  world.tick++;
  const start = ticks(COUNTDOWN);
  if (world.tick < start) {
    for (const n of [1, 2, 3]) if (world.tick === ticks(n - 1) + 1) events.push({ kind: "light", n });
    return events;
  }
  if (world.tick === start) events.push({ kind: "go" });
  world.cars.forEach((car, k) => {
    if (car.phase === "off") {
      fly(car.off!);
      if (car.off!.t >= FLY + MARSHAL) {
        car.phase = "slot";
        car.off = null;
        car.v = 0;
        events.push({ kind: "back", car: k });
      }
      return;
    }
    // Home: the pedal no longer counts, and the car rolls to a stop beyond the line.
    const on = car.phase === "slot" && !!throttle[k];
    car.throttle = on;
    const a = on ? ACCEL * (1 - car.v / VMAX) : -(BRAKE + DRAG * car.v) * (car.phase === "done" ? 0.35 : 1);
    car.v = Math.min(VMAX, Math.max(0, car.v + a * DT));
    const d = offsets[car.lane];
    car.u += car.v * DT;
    let seg = segments[car.seg];
    while (car.u >= laneLength(seg, d)) {
      car.u -= laneLength(seg, d);
      car.seg = (car.seg + 1) % segments.length;
      seg = segments[car.seg];
      if (car.seg === 0 && car.phase === "slot") {
        car.laps++;
        const lap = world.tick - car.lapStart;
        car.best = car.best === null ? lap : Math.min(car.best, lap);
        car.lapStart = world.tick;
        events.push({ kind: "lap", car: k });
        if (car.laps >= world.laps) {
          car.phase = "done";
          car.finish = world.tick;
          car.place = world.order.length;
          world.order.push(k);
        } else rejudge(world, k, level);
      }
    }
    if (car.phase !== "slot") return;
    // The pull of the curve against the grip: within it the tail comes back; beyond it, it steps out.
    if (seg.kind === "curve") {
      const pull = (car.v * car.v) / laneRadius(seg, d) / gripOf(seg) - 1;
      if (pull > 0) car.slide += Math.min(pull, PULL_CAP) * SLIDE_RATE * DT;
      else car.slide = Math.max(0, car.slide - RECOVER * DT);
      if (car.slide >= 1 || pull > HARD) {
        events.push({ kind: "off", car: k, speed: car.v });
        deslot(world, k);
      }
    } else car.slide = Math.max(0, car.slide - RECOVER * 1.5 * DT);
  });
  const first = world.order.length ? world.cars[world.order[0]].finish! : null;
  if (world.order.length === world.cars.length || (first !== null && world.tick >= first + ticks(WAIT))) {
    world.closed = world.tick;
    events.push({ kind: "end", ranking: ranking(world) });
  }
  return events;
}
/**
 * A computer driver's pedal: it looks ahead along its lane at the curves it will meet before it could stop, and keeps
 * its foot down only while it is slower than what it judges each of them allows (its judgement of a curve, a share of
 * the true safe speed, drawn for each lap) less the speed it can lose braking before it gets there. A lower level aims
 * nearer the grip than it can keep, strays more and brakes later, so it now and then flies off.
 */
export function autopilot(world: World, k: number, level: Level = "normal") {
  const car = world.cars[k],
    skill = LEVELS[level];
  if (car.phase !== "slot" || world.tick < world.react[k]) return false;
  const { segments, offsets } = world.track,
    d = offsets[car.lane],
    braking = (BRAKE + DRAG * car.v) * skill.late,
    reach = (car.v * car.v) / (2 * BRAKE * 0.8) + 1.5;
  let limit = Infinity,
    ahead = -car.u;
  for (let n = 0; n < segments.length && ahead < reach; n++) {
    const index = (car.seg + n) % segments.length,
      seg = segments[index];
    if (seg.kind === "curve") {
      const want = safeSpeed(seg, d) * world.judge[k][index],
        far = Math.max(0, ahead);
      limit = Math.min(limit, Math.sqrt(want * want + 2 * braking * far));
    }
    ahead += laneLength(seg, d);
  }
  // Tail out: a careful driver lifts at once.
  if (level !== "easy" && car.slide > (level === "hard" ? 0.2 : 0.45)) return false;
  return car.v < limit - 0.08;
}
