/**
 * The roulette wheel's insides, free of Three.js and the page: a European single-zero wheel (37 pockets in the real
 * order round the rotor) and a ball under a simple but honest physics. The croupier turns the rotor one way and sends
 * the ball round the track the other way (the launch is the only thing drawn from the seed); the ball slows by
 * friction and air, and once it is too slow to hold the banked track it leaves it and runs down the stator's cone,
 * where it may strike the diamonds (deflectors); it comes onto the turning rotor, hops over or bounces off the frets
 * between the pockets, and comes to rest in one. The number is the pocket it really rests in.
 *
 * Metres and seconds, in the wheel's own plane: x and z across it, angles anticlockwise seen from above. The ball's
 * height is worked out for the view from where it is (`heightAt`). Fixed slices of `DT`.
 */
export const DT = 1 / 480;
/** The pockets in their order round the rotor, anticlockwise from 0. */
export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export type Colour = "red" | "black" | "green";
export const colourOf = (n: number): Colour => (n === 0 ? "green" : REDS.includes(n) ? "red" : "black");
/** The angle each pocket spans on the rotor. */
export const SLOT = (2 * Math.PI) / ORDER.length;
const G = 9.81;
/** The ball, and where it runs: the track's radius (its middle), the cone from below the track down to the rotor's rim, the pockets in to the turret. */
export const BALL_R = 0.0095,
  TRACK_R = 0.372,
  CONE_OUT = 0.352,
  RIM = 0.262,
  POCKET_IN = 0.205;
/** How the track is banked (tan of its angle): below `V_DROP` the ball can no longer hold it and runs down the cone. */
const BANK = 0.12,
  V_DROP = Math.sqrt(G * BANK * TRACK_R);
/** The slope of the cone and of the pockets' floor toward the middle, as the share of gravity that pulls the ball in. */
const CONE_PULL = 0.22 * G,
  POCKET_PULL = 0.3 * G;
/** Slowing on the track (rolling, and the air at speed), on the cone and in the pockets. */
const TRACK_SLOW = 0.15,
  TRACK_AIR = 0.25,
  CONE_SLOW = 0.35,
  CONE_AIR = 0.25,
  POCKET_SLOW = 0.55,
  POCKET_DRAG = 0.8;
/** The eight diamonds on the cone: their radius out from the middle, their size, and how lively a strike on one is. */
export const DIAMOND_R = 0.31,
  DIAMOND_SIZE = 0.011,
  DIAMONDS = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4 + Math.PI / 8);
const DIAMOND_E = 0.55;
/** Over a fret above this speed across it the ball hops on (losing some of its speed); below it, it bounces back. */
const HOP = 0.34,
  FRET_E = 0.4;
/** The ball at rest: below this speed in its pocket for `REST_TIME`. */
const REST_V = 0.02,
  REST_TIME = 0.35;
/** The longest a spin may take before the ball is laid in the pocket under it (it never needs to: a safety net). */
export const MOST_TIME = 40;
/** The launch: the ball's speed round the track and the rotor's turning the other way, both drawn from the seed. */
export const LAUNCH = { ball: [6.2, 7.6], rotor: [1.5, 2.6] } as const;

export type Phase = "track" | "cone" | "rotor" | "rest";
export interface Spin {
  phase: Phase;
  t: number;
  /** The ball: where it is and how it goes, in the wheel's still frame (on the rotor, `x`/`z` still mean the still frame). */
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** The rotor's angle and its turning (radians, radians a second). */
  rotor: number;
  spin: number;
  /** The ball on the track: its angle and speed round it. */
  angle: number;
  speed: number;
  /** How long it has lain still, and a hop's time left (for the view's height). */
  still: number;
  hop: number;
  /** The pocket it lies in (its place in `ORDER`), once at rest; and whether the safety net laid it there. */
  slot: number;
  forced: boolean;
}
export type Event = { kind: "drop" } | { kind: "diamond"; strength: number } | { kind: "rotor" } | { kind: "fret"; strength: number } | { kind: "rest"; number: number };

/** A small seeded generator (the launch's only randomness). */
export function seeded(seed: number) {
  let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
/** A spin launched from `seed`: the rotor at a drawn angle and speed one way, the ball sent round the track the other. */
export function launch(seed: number): Spin {
  const r = seeded(seed),
    angle = r() * Math.PI * 2,
    speed = LAUNCH.ball[0] + r() * (LAUNCH.ball[1] - LAUNCH.ball[0]),
    rotor = r() * Math.PI * 2,
    spin = -(LAUNCH.rotor[0] + r() * (LAUNCH.rotor[1] - LAUNCH.rotor[0]));
  return { phase: "track", t: 0, x: Math.cos(angle) * TRACK_R, z: -Math.sin(angle) * TRACK_R, vx: 0, vz: 0, rotor, spin, angle, speed, still: 0, hop: 0, slot: -1, forced: false };
}
/**
 * Positions: the plane's z points toward the viewer, so an anticlockwise angle seen from above is (cos a, -sin a).
 * These two turn an angle and a radius into x and z and back.
 */
const toXZ = (a: number, r: number) => ({ x: Math.cos(a) * r, z: -Math.sin(a) * r });
export const angleOf = (x: number, z: number) => Math.atan2(-z, x);
const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** The pocket (its place in `ORDER`) at the still angle `a`, with the rotor turned to `rotor`. */
export const slotAt = (a: number, rotor: number) => Math.floor(wrap(a - rotor) / SLOT) % ORDER.length;

/** One slice of the spin; what happened in it. */
export function step(s: Spin): Event[] {
  const out: Event[] = [];
  if (s.phase === "rest") return out;
  s.t += DT;
  s.rotor = wrap(s.rotor + s.spin * DT);
  // The rotor slows a little (it turns for a long while on its bearing).
  s.spin += Math.sign(-s.spin) * Math.min(Math.abs(s.spin), 0.025 * DT);
  if (s.hop > 0) s.hop = Math.max(0, s.hop - DT);
  if (s.phase === "track") {
    s.speed = Math.max(0, s.speed - (TRACK_SLOW + TRACK_AIR * s.speed * s.speed) * DT);
    s.angle += (s.speed / TRACK_R) * DT;
    Object.assign(s, toXZ(s.angle, TRACK_R));
    if (s.speed < V_DROP) {
      // Off the track: on along its way, the tangent (anticlockwise), and down the cone.
      s.phase = "cone";
      const t = { x: -Math.sin(s.angle), z: -Math.cos(s.angle) };
      s.vx = t.x * s.speed;
      s.vz = t.z * s.speed;
      const p = toXZ(s.angle, CONE_OUT - 0.001);
      s.x = p.x;
      s.z = p.z;
      out.push({ kind: "drop" });
    }
    return out;
  }
  if (s.phase === "cone") cone(s, out);
  else rotorSlice(s, out);
  if (s.t > MOST_TIME && (s.phase as Phase) !== "rest") {
    // The safety net (never reached in play): laid in the pocket under it.
    s.slot = slotAt(angleOf(s.x, s.z), s.rotor);
    s.phase = "rest";
    s.forced = true;
    out.push({ kind: "rest", number: ORDER[s.slot] });
  }
  return out;
}
/** On the cone, in the still frame: pulled in by its slope, slowed, struck off the diamonds; onto the rotor at its rim. */
function cone(s: Spin, out: Event[]) {
  const r = Math.hypot(s.x, s.z),
    ux = s.x / r,
    uz = s.z / r,
    v = Math.hypot(s.vx, s.vz) || 1e-9,
    slow = CONE_SLOW + CONE_AIR * v * v;
  s.vx += (-ux * CONE_PULL - (s.vx / v) * slow) * DT;
  s.vz += (-uz * CONE_PULL - (s.vz / v) * slow) * DT;
  s.x += s.vx * DT;
  s.z += s.vz * DT;
  const now = Math.hypot(s.x, s.z);
  // The track's lower edge stops it going back up and out: it rolls along it, its outward way taken.
  if (now > CONE_OUT) {
    const nx = s.x / now,
      nz = s.z / now,
      out_ = s.vx * nx + s.vz * nz;
    s.x = nx * CONE_OUT;
    s.z = nz * CONE_OUT;
    if (out_ > 0) {
      s.vx -= 1.3 * out_ * nx;
      s.vz -= 1.3 * out_ * nz;
    }
  }
  for (const a of DIAMONDS) {
    const c = toXZ(a, DIAMOND_R),
      dx = s.x - c.x,
      dz = s.z - c.z,
      d = Math.hypot(dx, dz),
      reach = BALL_R + DIAMOND_SIZE;
    if (d >= reach) continue;
    const nx = dx / d,
      nz = dz / d,
      into = s.vx * nx + s.vz * nz;
    s.x = c.x + nx * reach;
    s.z = c.z + nz * reach;
    if (into < 0) {
      s.vx -= (1 + DIAMOND_E) * into * nx;
      s.vz -= (1 + DIAMOND_E) * into * nz;
      // The glancing part is slowed by the rub.
      const tx = -nz,
        tz = nx,
        along = s.vx * tx + s.vz * tz;
      s.vx -= 0.12 * along * tx;
      s.vz -= 0.12 * along * tz;
      // A diamond is pointed: a ball pressed straight onto it does not balance there but rolls off to one side.
      if (Math.abs(along) < 0.06) {
        const kick = 0.06 * Math.sign(along || 1) - 0.88 * along;
        s.vx += kick * tx;
        s.vz += kick * tz;
      }
      if (-into > 0.08) {
        out.push({ kind: "diamond", strength: Math.min(1, -into / 1.2) });
        s.hop = 0.12;
      }
    }
  }
  if (Math.hypot(s.x, s.z) < RIM) {
    s.phase = "rotor";
    out.push({ kind: "rotor" });
  }
}
/**
 * On the rotor: worked in the rotor's own turning frame (its pull in, the turning's outward and sideways pushes, the
 * pockets' drag), the frets met as the ball crosses from one pocket to the next, the turret's wall inside and the rim
 * outside (over which a lively ball may leave the rotor again for the cone).
 */
function rotorSlice(s: Spin, out: Event[]) {
  const w = s.spin,
    // The ball's way relative to the rotor: its own, less the rotor's under it (w × p, anticlockwise positive).
    relX = s.vx - w * s.z,
    relZ = s.vz + w * s.x,
    r = Math.hypot(s.x, s.z),
    ux = s.x / r,
    uz = s.z / r,
    v = Math.hypot(relX, relZ) || 1e-9,
    slow = POCKET_SLOW + POCKET_DRAG * v,
    take = Math.min(v, slow * DT) / v;
  // Pulled in by the floor's slope; pushed out by the turning (w² r) and sideways by it (Coriolis: 2 w × rel).
  const ax = -ux * POCKET_PULL + w * w * s.x - 2 * w * relZ,
    az = -uz * POCKET_PULL + w * w * s.z + 2 * w * relX;
  let nrx = relX * (1 - take) + ax * DT,
    nrz = relZ * (1 - take) + az * DT;
  const before = slotAt(angleOf(s.x, s.z), s.rotor);
  // Moved in the still frame: its relative way plus the rotor's under it (w × p is (w z, -w x) in these axes).
  const ox = s.x,
    oz = s.z;
  s.x += (nrx + w * oz) * DT;
  s.z += (nrz - w * ox) * DT;
  let now = Math.hypot(s.x, s.z);
  // The turret's wall inside.
  if (now < POCKET_IN + BALL_R) {
    const nx = s.x / now,
      nz = s.z / now,
      into = nrx * nx + nrz * nz;
    s.x = nx * (POCKET_IN + BALL_R);
    s.z = nz * (POCKET_IN + BALL_R);
    if (into < 0) {
      nrx -= 1.35 * into * nx;
      nrz -= 1.35 * into * nz;
    }
    now = POCKET_IN + BALL_R;
  }
  // The frets: crossing into the next pocket.
  const after = slotAt(angleOf(s.x, s.z), s.rotor);
  if (after !== before) {
    const nx = s.x / now,
      nz = s.z / now,
      // Anticlockwise along the rim.
      tx = nz,
      tz = -nx,
      across = nrx * tx + nrz * tz;
    if (Math.abs(across) > HOP) {
      // Over the fret: on, slower, and thrown up and outward a little.
      nrx -= 0.25 * across * tx;
      nrz -= 0.25 * across * tz;
      nrx += 0.18 * Math.abs(across) * nx;
      nrz += 0.18 * Math.abs(across) * nz;
      s.hop = 0.1;
      out.push({ kind: "fret", strength: Math.min(1, Math.abs(across) / 1.2) });
    } else {
      // Back off the fret into the pocket it came from.
      const fret = s.rotor + (across > 0 ? (before + 1) * SLOT : before * SLOT),
        back = fret - Math.sign(across || 1) * 0.004,
        p = toXZ(back, now);
      s.x = p.x;
      s.z = p.z;
      nrx -= (1 + FRET_E) * across * tx;
      nrz -= (1 + FRET_E) * across * tz;
      if (Math.abs(across) > 0.05) out.push({ kind: "fret", strength: Math.min(1, Math.abs(across) / 1.2) });
    }
  }
  // Back in the still frame.
  s.vx = nrx + w * s.z;
  s.vz = nrz - w * s.x;
  if (now > RIM) {
    s.phase = "cone";
    return;
  }
  const rel = Math.hypot(nrx, nrz);
  s.still = rel < REST_V && now < POCKET_IN + BALL_R + 0.02 ? s.still + DT : 0;
  if (s.still >= REST_TIME) {
    s.slot = slotAt(angleOf(s.x, s.z), s.rotor);
    s.phase = "rest";
    out.push({ kind: "rest", number: ORDER[s.slot] });
  }
}
/** The ball's height over the rotor's rim (metres): up on the track, down the cone, in a pocket, and a hop's lift. */
export function heightAt(s: Spin) {
  const r = Math.hypot(s.x, s.z),
    hop = s.hop > 0 ? 0.014 * Math.sin((s.hop / 0.12) * Math.PI) : 0;
  if (s.phase === "track") return 0.05;
  if (r >= RIM) return 0.004 + (0.036 * (r - RIM)) / (CONE_OUT - RIM) + hop;
  return -0.012 - (0.006 * (RIM - r)) / (RIM - POCKET_IN) + hop;
}
/** One picture of a spin a frame, for the view: the ball's place and height, the rotor's turn, and what happened since the last. */
export interface Frame {
  t: number;
  x: number;
  y: number;
  z: number;
  rotor: number;
  phase: Phase;
  events: Event[];
}
/** The whole spin from `seed`, a picture every `every` seconds, until the ball rests: its frames and the number. */
export function runSpin(seed: number, every = 1 / 60) {
  const s = launch(seed),
    frames: Frame[] = [];
  let events: Event[] = [],
    next = 0;
  while (s.phase !== "rest") {
    events.push(...step(s));
    if (s.t >= next || (s.phase as Phase) === "rest") {
      frames.push({ t: s.t, x: s.x, y: heightAt(s), z: s.z, rotor: s.rotor, phase: s.phase, events });
      events = [];
      next += every;
    }
  }
  return { frames, number: ORDER[s.slot], slot: s.slot, forced: s.forced, time: s.t, rotorSpin: s.spin };
}
/** Only the number a seed's spin comes to (what the rules need). */
export function numberOf(seed: number) {
  const s = launch(seed);
  while (s.phase !== "rest") step(s);
  return ORDER[s.slot];
}
