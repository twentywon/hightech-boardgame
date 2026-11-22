import { DT, LANDING, MAX_STEPS, REST, type Arena, type Disc, type Heard } from "../flick/physics";

/**
 * Alkkagi's own stepping of the flick physics: the stones are real discs. Each one turns about the upright as well
 * as sliding (`w`, `a`); the board's friction is shared between the two the way it is under a spinning puck (a
 * spinning stone glides farther, and spin and slide die together); a glancing knock grips at the touching edges
 * as they slip past each other and sets both stones turning; how much of a knock comes back is the stuff's own (go stones
 * of slate and shell ring, wooden janggi pieces thud); a stone struck into the air comes down with a little bounce;
 * and a stone whose middle passes the edge tips over it and tumbles down to what lies below (`fell`, played out by
 * `fallTrack`), where it stays. Everything is stepped in the same fixed slices as the other flicked games, so a
 * shot always ends the same way and the computer can think it through; the rules and the view run this very code.
 * The other flicked games keep `step` in `flick/physics.ts` unchanged.
 */
export interface Fall {
  /** Where the stone was when its middle left the board, how fast it went, and its turn. */
  x: number;
  z: number;
  vx: number;
  vz: number;
  w: number;
  a: number;
  /** The way out over the edge it left by (a unit vector along x or z). */
  nx: number;
  nz: number;
  /** How far beyond the edge its middle was then (more than its radius when it came down from a flight out there). */
  beyond: number;
  r: number;
  /** Half its thickness. */
  h: number;
}
export interface Stone extends Disc {
  /** How fast it turns about the upright (radians a second; positive turns +x toward −z, as `rotation.y` does). */
  w?: number;
  /** How far it has turned. */
  a?: number;
  /** Slices left of the small bounce after coming down from a flight. */
  hop?: number;
  /** How it left the board, when it has. */
  fell?: Fall;
}
/**
 * The stuff of a set: how much of a knock comes back (`bounce`), how the edges grip (`grip`), and half the thickness
 * of a stone as a share of its radius (`thick`), or in units when every piece is as thick (`thickFixed`).
 */
export interface StoneArena extends Arena {
  grip: number;
  thick: number;
  thickFixed?: boolean;
  /** What lies under the board: the floor's height, raised tops (a low table) and round things standing on the floor. */
  below: Below;
}
export interface Below {
  floor: number;
  /** Raised flat tops, by their half sizes and the height of their tops; the board itself is the first. */
  tops: { halfX: number; halfZ: number; y: number; bottom: number }[];
  /** Round things on the floor that a falling stone stops against (bowls). */
  posts: { x: number; z: number; r: number; top: number }[];
}
/** A knock heard in a slice: where, how hard, and what struck what. */
export interface Bump {
  x: number;
  z: number;
  force: number;
  kind: "stone" | "post" | "land";
}
export interface StoneHeard extends Heard {
  at?: Bump[];
}
/** Below this turn a stone has stopped turning. */
export const W_REST = 0.25;
/** Slices of the small bounce after a flight, and its height as a share of the flight's. */
export const HOP = 16,
  HOP_HEIGHT = 0.16;
/** Gravity at the table's scale (a unit is about five centimetres), a little gentler than the real thing so that a fall can be seen. */
export const G = 150;
/**
 * The share of the board's friction a sliding stone feels while it also turns, and the share of a turning stone's
 * friction that slows its turn, by how fast it slides against how fast its rim turns (`e`). Uniform pressure under a
 * disc: all of it when it only slides, none when it only turns, the friction going to the turn as the turn grows
 * (approximants that keep the exact limits at both ends).
 */
export const slideShare = (e: number) => (e === Infinity ? 1 : e / Math.sqrt(e * e + 1));
export const turnShare = (e: number) => (e === Infinity ? 0 : 0.5 / Math.sqrt(e * e + 0.5625));
/** Whether anything still slides or turns. */
export const stirring = (discs: Stone[]) => discs.some((d) => d.on && (d.vx !== 0 || d.vz !== 0 || (d.w ?? 0) !== 0));
/** Advances every stone by one slice. Returns the ids that left the board in it. */
export function stepStones(discs: Stone[], arena: StoneArena, heard?: StoneHeard): number[] {
  const gone: number[] = [];
  for (const d of discs) {
    if (!d.on) continue;
    if (d.hop) d.hop--;
    if (d.air) {
      // In the air nothing slows it; it comes down with most of its speed spent, and bounces once.
      d.x += d.vx * DT;
      d.z += d.vz * DT;
      if (--d.air === 0) {
        d.vx *= LANDING;
        d.vz *= LANDING;
        d.hop = HOP;
        if (heard) {
          heard.hits++;
          heard.at?.push({ x: d.x, z: d.z, force: 6, kind: "land" });
        }
      }
      continue;
    }
    const speed = Math.hypot(d.vx, d.vz),
      w = d.w ?? 0,
      turn = Math.abs(w);
    if (speed <= REST && turn <= W_REST) {
      d.vx = d.vz = 0;
      if (d.w) d.w = 0;
      continue;
    }
    const e = turn > 1e-9 ? speed / (turn * d.r) : Infinity,
      mu = arena.friction;
    if (speed <= REST) d.vx = d.vz = 0;
    else {
      const slowed = Math.max(0, speed - mu * slideShare(e) * DT);
      d.vx *= slowed / speed;
      d.vz *= slowed / speed;
    }
    if (turn > 0) {
      // The torque of the friction over the disc's face, against its moment (half m r²).
      const left = Math.max(0, turn - ((2 * mu * turnShare(e)) / d.r) * DT);
      d.w = left <= W_REST ? 0 : Math.sign(w) * left;
    }
    d.x += d.vx * DT;
    d.z += d.vz * DT;
    d.a = (d.a ?? 0) + (d.w ?? 0) * DT;
  }
  // Stones that overlap are pushed apart; the knock is shared along the line between them, and the edges that
  // touch grip as they slip past each other, turning both stones.
  for (let i = 0; i < discs.length; i++) {
    const a = discs[i];
    if (!a.on || a.air) continue;
    for (let j = i + 1; j < discs.length; j++) {
      const b = discs[j];
      if (!b.on || b.air) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        reach = a.r + b.r,
        d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 === 0) continue;
      const dist = Math.sqrt(d2),
        nx = dx / dist,
        nz = dz / dist,
        overlap = reach - dist,
        total = a.m + b.m;
      a.x -= nx * overlap * (b.m / total);
      a.z -= nz * overlap * (b.m / total);
      b.x += nx * overlap * (a.m / total);
      b.z += nz * overlap * (a.m / total);
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing <= 0) continue;
      if (heard && closing > 0.6) {
        heard.hits++;
        heard.discs = (heard.discs ?? 0) + 1;
        heard.force = Math.max(heard.force ?? 0, closing);
        heard.at?.push({ x: a.x + nx * a.r, z: a.z + nz * a.r, force: closing, kind: "stone" });
      }
      const normal = ((1 + arena.bounce) * closing) / (1 / a.m + 1 / b.m);
      a.vx -= (normal / a.m) * nx;
      a.vz -= (normal / a.m) * nz;
      b.vx += (normal / b.m) * nx;
      b.vz += (normal / b.m) * nz;
      grip(a, a.r, nx, nz, b, b.r, normal, arena.grip);
    }
  }
  for (const d of discs) {
    if (!d.on || d.air) continue;
    for (const post of arena.posts ?? []) {
      const dx = d.x - post.x,
        dz = d.z - post.z,
        dist = Math.hypot(dx, dz),
        reach = d.r + post.r;
      if (dist >= reach || dist === 0) continue;
      const nx = dx / dist,
        nz = dz / dist,
        into = d.vx * nx + d.vz * nz;
      d.x = post.x + nx * reach;
      d.z = post.z + nz * reach;
      if (into < 0) {
        const normal = -(1 + arena.bounce * 0.7) * into * d.m;
        d.vx += (normal / d.m) * nx;
        d.vz += (normal / d.m) * nz;
        // A fixed post: the stone's edge grips it as on another stone that cannot move.
        grip(d, d.r, -nx, -nz, null, post.r, normal, arena.grip);
        if (heard && into < -0.6) {
          heard.hits++;
          heard.at?.push({ x: d.x - nx * d.r, z: d.z - nz * d.r, force: -into, kind: "post" });
        }
      }
    }
    const out = Math.max(Math.abs(d.x) - arena.halfX, Math.abs(d.z) - arena.halfZ);
    if (out > 0) {
      // Over the edge: it tips off, and what it does from there is told by `fallTrack`.
      const acrossX = Math.abs(d.x) - arena.halfX >= Math.abs(d.z) - arena.halfZ;
      d.fell = {
        x: d.x,
        z: d.z,
        vx: d.vx,
        vz: d.vz,
        w: d.w ?? 0,
        a: d.a ?? 0,
        nx: acrossX ? Math.sign(d.x) : 0,
        nz: acrossX ? 0 : Math.sign(d.z),
        beyond: out,
        r: d.r,
        h: arena.thickFixed ? arena.thick : d.r * arena.thick,
      };
      d.on = false;
      d.vx = d.vz = 0;
      d.w = 0;
      if (d.hop) d.hop = 0;
      gone.push(d.id);
    }
  }
  return gone;
}
/**
 * The edges of two stones touching at `n` (from a toward b) slip past each other; friction between them, at most
 * `grip` of the knock, takes out that slip, which turns each stone (`b` null: a fixed post).
 */
function grip(a: Stone, ra: number, nx: number, nz: number, b: Stone | null, rb: number, normal: number, mu: number) {
  if (mu <= 0) return;
  const wa = a.w ?? 0,
    wb = b ? (b.w ?? 0) : 0,
    // The velocity of each touching point: the stone's own, and its turn carrying its rim (w × r, about +y).
    pax = a.vx + wa * ra * nz,
    paz = a.vz - wa * ra * nx,
    pbx = (b ? b.vx : 0) - wb * rb * nz,
    pbz = (b ? b.vz : 0) + wb * rb * nx,
    ux = pax - pbx,
    uz = paz - pbz,
    along = ux * nx + uz * nz,
    tx = ux - along * nx,
    tz = uz - along * nz,
    slip = Math.hypot(tx, tz);
  if (slip < 1e-6) return;
  // A disc's rim is three times as hard to move sideways as its middle (a point mass, plus the turn: r² / ½ m r²).
  const give = 3 / a.m + (b ? 3 / b.m : 0),
    impulse = Math.min(mu * normal, slip / give),
    fx = (-impulse * tx) / slip,
    fz = (-impulse * tz) / slip;
  a.vx += fx / a.m;
  a.vz += fz / a.m;
  // The turn from a push f at the rim point r n: (r n × f) about +y = r (nz fx − nx fz), over ½ m r².
  a.w = wa + (2 * (nz * fx - nx * fz)) / (a.m * ra);
  if (b) {
    b.vx -= fx / b.m;
    b.vz -= fz / b.m;
    // At b the rim point is −r n and the push −f: the same sign of turn as a's.
    b.w = wb + (2 * (nz * fx - nx * fz)) / (b.m * rb);
  }
}
/** Runs until everything rests. Returns the ids that left the board, in order, and the slices it took. */
export function settleStones(discs: Stone[], arena: StoneArena) {
  const gone: number[] = [];
  let steps = 0;
  while (stirring(discs) && steps < MAX_STEPS) {
    gone.push(...stepStones(discs, arena));
    steps++;
  }
  for (const d of discs) {
    d.vx = d.vz = 0;
    if (d.w !== undefined) d.w = 0;
    delete d.air;
    delete d.flight;
    if (d.hop) d.hop = 0;
  }
  return { gone, steps };
}
/** Where a falling stone is in one slice: its middle, how far it has tipped (about the level line across its way out) and turned. */
export interface FallPose {
  x: number;
  y: number;
  z: number;
  tip: number;
  a: number;
  /** It struck what lies below in this slice, this hard. */
  thud?: number;
}
/** How fast a stone slows on the floor, how much of a drop it bounces back, and of its way it keeps when it strikes. */
const FLOOR_FRICTION = 14,
  FLOOR_BOUNCE = 0.32,
  FLOOR_KEEP = 0.55,
  LAST_SLICES = 120 * 6;
/** The height of what lies below at a place, and the top that stands there (−1 for the floor). */
function groundAt(below: Below, x: number, z: number) {
  let y = below.floor,
    top = -1;
  below.tops.forEach((t, i) => {
    if (Math.abs(x) <= t.halfX && Math.abs(z) <= t.halfZ && t.y > y) {
      y = t.y;
      top = i;
    }
  });
  return { y, top };
}
/**
 * The whole way of a stone that went over the edge, one pose a slice: it tips about the edge while its middle
 * passes beyond, then drops, tumbling the faster the slower it went out, strikes what lies below, bounces, comes to
 * lie flat and slides to rest. The same fall always takes the same way; the last pose is where it lies.
 */
export function fallTrack(fall: Fall, below: Below): FallPose[] {
  const out: FallPose[] = [],
    { r, h, nx, nz } = fall,
    top0 = below.tops[0]?.y ?? 0;
  // Its way out: at least a slow creep, so a stone that only just went over still tips off.
  const along = fall.vx * nx + fall.vz * nz,
    outward = Math.max(0.9, along),
    sx = fall.vx - along * nx,
    sz = fall.vz - along * nz;
  let x = fall.x,
    z = fall.z,
    y = top0 + h,
    vx = sx + outward * nx,
    vz = sz + outward * nz,
    vy = 0,
    tip = 0,
    spin = 0,
    a = fall.a,
    w = fall.w,
    beyond = fall.beyond,
    resting = false,
    lying = 0,
    struck = 0;
  // Tipping over the edge: the weight beyond it turns the stone down about the edge until its near rim comes off.
  if (beyond < r) {
    while (beyond < r && out.length < 240) {
      spin += ((G * Math.max(0.15 * r, beyond)) / (1.25 * r * r)) * DT;
      tip += spin * DT;
      x += vx * DT;
      z += vz * DT;
      beyond += outward * DT;
      a += w * DT;
      y = top0 + h * Math.cos(tip) - (beyond * Math.sin(tip)) / 2;
      out.push({ x, y, z, tip, a });
    }
    vy = -spin * beyond * 0.6;
  } else spin = 2 + 22 / (1 + outward);
  // A stone that went out fast flies flat; a slow one keeps turning over as it drops.
  spin = Math.min(spin, 30);
  while (out.length < LAST_SLICES) {
    const ground = groundAt(below, x, z),
      // How far its lowest point hangs below its middle, tipped as it is.
      reach = Math.abs(r * Math.sin(tip)) + h * Math.abs(Math.cos(tip));
    let thud: number | undefined;
    if (!resting) {
      vy -= G * DT;
      x += vx * DT;
      y += vy * DT;
      z += vz * DT;
      tip += spin * DT;
      a += w * DT;
      // Never into the side of the board or of a raised top it fell from.
      for (const t of below.tops) {
        const inX = t.halfX - Math.abs(x),
          inZ = t.halfZ - Math.abs(z);
        if (y < t.y && y + reach > t.bottom && inX > -r * 0.55 && inZ > -r * 0.55) {
          if (inX + r * 0.55 < inZ + r * 0.55) {
            x = Math.sign(x) * (t.halfX + r * 0.55);
            vx = Math.sign(x) * Math.abs(vx) * 0.3;
          } else {
            z = Math.sign(z) * (t.halfZ + r * 0.55);
            vz = Math.sign(z) * Math.abs(vz) * 0.3;
          }
        }
      }
      if (y - reach <= ground.y && vy < 0) {
        y = ground.y + reach;
        thud = -vy;
        struck++;
        if (-vy > 9 && struck < 4) {
          vy = -vy * FLOOR_BOUNCE;
          vx *= FLOOR_KEEP;
          vz *= FLOOR_KEEP;
          // The knock throws its tumble back and slows it.
          spin = -spin * 0.35 + (Math.sin(tip) >= 0 ? -3 : 3);
        } else {
          resting = true;
          lying = ground.y;
          vy = 0;
        }
        w *= 0.6;
      }
    } else {
      // Lying on what is below: it settles flat and slides to a stop; off the end of a raised top it drops again.
      const flat = Math.round(tip / Math.PI) * Math.PI;
      tip += (flat - tip) * Math.min(1, 18 * DT);
      if (Math.abs(flat - tip) < 0.002) tip = flat;
      const speed = Math.hypot(vx, vz),
        slowed = Math.max(0, speed - FLOOR_FRICTION * DT);
      if (speed > 0) {
        vx *= slowed / speed;
        vz *= slowed / speed;
      }
      w = Math.sign(w) * Math.max(0, Math.abs(w) - 30 * DT);
      x += vx * DT;
      z += vz * DT;
      a += w * DT;
      const under = groundAt(below, x, z);
      if (under.y < lying - 0.01) {
        resting = false;
        spin = 6;
      } else {
        lying = under.y;
        y = lying + Math.abs(r * Math.sin(tip)) + h * Math.abs(Math.cos(tip));
      }
    }
    // Round things on the floor stop it.
    for (const post of below.posts) {
      const dx = x - post.x,
        dz = z - post.z,
        dist = Math.hypot(dx, dz);
      if (dist < post.r + r && y < post.top + h && dist > 0) {
        x = post.x + (dx / dist) * (post.r + r);
        z = post.z + (dz / dist) * (post.r + r);
        const into = (vx * dx + vz * dz) / dist;
        if (into < 0) {
          vx -= (1.5 * into * dx) / dist;
          vz -= (1.5 * into * dz) / dist;
        }
      }
    }
    out.push({ x, y, z, tip, a, ...(thud ? { thud } : {}) });
    if (resting && vx === 0 && vz === 0 && w === 0 && tip === Math.round(tip / Math.PI) * Math.PI) break;
  }
  return out;
}
/** Where a stone that went over the edge comes to lie. */
export const fallRest = (fall: Fall, below: Below) => {
  const track = fallTrack(fall, below);
  return track[track.length - 1];
};
