/**
 * 금화 쟁탈전's valley, free of Three.js and the page: two bandit kings, loot falling from the sky, a merchant's cart
 * crossing the road, and a castle at each end whose treasury is to be filled. The view steps it in fixed slices
 * (`DT`) and reports deposits, raids and the clock's end as moves.
 *
 * Seen from the side, metres and seconds: x across (side 0's castle at the left, side 1's at the right), y up from the
 * road. The ground is y = 0; the ledges (`PLATFORMS`) are stood on from above and passed through from below.
 *
 * How it is played (the user asked for a game of the kind of two bandits filling their castles with gold: falling
 * loot, a caravan to rob, each other to rob; the rules in detail are our own): a bandit runs, jumps and swings a club.
 * Loot (`KINDS`: a coin 1, a pouch 3, a gem 5; a chest 12 no longer falls from the sky, the user asked) falls now and then and is taken by touching it, in the air
 * or where it lies, into a sack that holds `CAP`; a full sack slows its bearer. Gold counts only once it is carried
 * to one's own gate. A blow of the club makes the other bandit drop part of its sack and stuns it a moment; a bomb
 * (it falls with the loot) does the same to whoever is near when it goes off. The merchant's cart sheds gold at each
 * blow and breaks open at the last. A blow on the other's gate takes a little from its treasury (the coins fall out
 * before the gate, to be carried home like any), and the castle answers by dropping a fire pot there.
 */
/**
 * The valley (gate to gate 20 m; it was 50 m, then 35 m, then 25 m, and the user asked
 * for it shorter each time): the castles are far apart and the view follows a bandit along it. And it is played at an easy pace: a bandit runs at 2.8 m/s and a jump hangs in
 * the air for over a second (the game was asked to be much slower than at first, when it ran at 5.6 and a jump
 * lasted 0.8 s; every other speed and time was scaled with it, the heights kept).
 * The sim is stepped in slices of `DT` s.
 */
export const DT = 1 / 120;
/** The valley: how far a bandit may go either way, and where loot bounces back. */
export const X_MOST = 11,
  LOOT_MOST = 10.6;
/** A bandit: its half width and height, its run and jump, gravity (a jump rises JUMP² / 2G = 2 m). */
export const BODY = { half: 0.32, tall: 1.15 },
  RUN = 2.8,
  JUMP = 6.6,
  G = 10.9,
  /** How quickly it comes to its speed on the ground and in the air (m/s²). */
  GRIP = 18,
  AIR = 9;
/** A jump pressed up to `BUFFER` s before landing still jumps; so does one up to `COYOTE` s after walking off an edge. */
export const BUFFER = 0.18,
  COYOTE = 0.14;
/**
 * The sack: how much it holds, and how much a full one slows its bearer (the user asked that the load be felt: an
 * empty-handed bandit runs at `RUN`, one with a full sack at 60% of it, and in between by the gold carried).
 */
export const CAP = 20,
  LOAD_SLOW = 0.4;
/** How fast a bandit carrying `carry` runs at most. */
export const runOf = (carry: number) => RUN * (1 - LOAD_SLOW * Math.min(1, Math.max(0, carry) / CAP));
/** The gates: where each castle's stands (side 0 at −`GATE`), and how near counts as at it. */
export const GATE = 10,
  GATE_R = 1.05;
export const gateOf = (side: number) => (side === 0 ? -GATE : GATE);
/** The ledges, alike on both sides: stood on from above, passed through from below; a high one stands over a low one. */
const RIGHT = [
  { x0: 3.9, x1: 6.5, y: 1.6 },
  { x0: 3.0, x1: 4.7, y: 3.2 },
];
export const PLATFORMS = [
  { x0: -2.6, x1: 2.6, y: 1.6 },
  { x0: -1.3, x1: 1.3, y: 3.2 },
  ...RIGHT.flatMap((p) => [{ x0: -p.x1, x1: -p.x0, y: p.y }, p]),
];
/** The club: how long a swing lasts, when in it the blow lands, how far it reaches, and the wait before the next. */
export const SWING = 0.5,
  SWING_HIT = 0.16,
  REACH = 1.25,
  COOL = 0.9;
/**
 * A blow on a bandit: how long it is stunned (and cannot be struck or blown up again while down; once it stands it
 * may be struck at once: the user asked for no safe time after getting up), the share of its sack it drops, and the
 * wait before the striker's next swing (a little longer than the stun, so the one struck has a moment to get away
 * and is not struck again the instant it stands, over and over).
 */
export const STUN = 1.6,
  DROP_SHARE = 0.4,
  HIT_COOL = STUN + 0.45;
/** A bomb: its fuse once it lies, its blast's reach, the stun and the share of the sack lost. */
export const FUSE = 2.4,
  BLAST = 1.6,
  BOMB_STUN = 2.4,
  BOMB_SHARE = 0.5;
/** Loot in the air: its gravity and the fastest it falls; and how long it lies before it is gone. */
export const LOOT_G = 5.5,
  LOOT_FALL = 3.6,
  LOOT_LIFE = 18,
  /** How near a bandit's middle a piece of loot must be to be taken (across, and up from its feet). */
  TAKE = { across: 0.62, low: -0.25, high: 1.4 };
export type LootKind = "coin" | "pouch" | "gem" | "chest" | "bomb";
/** What each kind is worth, and how often it falls (shares of a hundred). */
export const KINDS: Record<LootKind, { value: number; share: number }> = {
  coin: { value: 1, share: 54 },
  pouch: { value: 3, share: 22 },
  gem: { value: 5, share: 9 },
  chest: { value: 12, share: 0 },
  bomb: { value: 0, share: 15 },
};
/** The seconds between two pieces falling (drawn between these), and where across they fall. */
export const DROP_EVERY = [0.85, 1.75],
  DROP_REACH = 9.1,
  DROP_BIAS = 1.4,
  DROP_FROM = 9.5;
/** The merchant's cart: its gold, its pace, what a blow sheds, how many blows break it, and the seconds between two carts. */
export const CART = { gold: 24, pace: 0.9, shed: 3, blows: 5, half: 1.05, first: 22, every: [36, 50] };
/** A raid on the other's gate: what a blow takes from its treasury, and how long the gate is then shut against the next. */
export const RAID = 2,
  RAID_LOCK = 5;
/**
 * The computer by level: how fast it runs (a share of a person's), how often it thinks again (s), how long it takes
 * to strike what has come into reach, the sack it goes home with (and how much it weighs the long way home: `thrift`
 * makes it bring a fuller sack from far off and prefer loot on the homeward side), how often it sees a bomb coming, the least the
 * other must carry for it to strike or to give chase (and from how far), and whether it climbs to the high ledges and
 * raids a gate left alone.
 */
export const LEVELS = {
  easy: { pace: 0.8, think: 0.8, react: 0.8, home: 14, thrift: 0, dodge: 0, strike: Infinity, chase: Infinity, chaseFar: 0, climb: false, raid: false },
  normal: { pace: 0.9, think: 0.5, react: 0.42, home: 10, thrift: 0.4, dodge: 0.7, strike: 5, chase: 10, chaseFar: 3.5, climb: true, raid: false },
  hard: { pace: 1, think: 0.24, react: 0.2, home: 8, thrift: 0.6, dodge: 1, strike: 3, chase: 7, chaseFar: 4, climb: true, raid: true },
};
export type Level = keyof typeof LEVELS;
/** A player's controls for one slice: the way it runs (−1 to 1), and whether jump and strike were pressed in it. */
export interface Input {
  x: number;
  jump: boolean;
  strike: boolean;
}
export const IDLE: Input = { x: 0, jump: false, strike: false };
export interface Bandit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  ground: boolean;
  carry: number;
  /** Seconds it is still stunned (down, and not to be struck or blown up again till it stands). */
  stun: number;
  /** Seconds since its swing began (−1: none), whether that swing's blow has landed, and the wait before the next. */
  swing: number;
  struck: boolean;
  cool: number;
  coyote: number;
  buffer: number;
  /** How far it has run (for its legs). */
  stride: number;
}
export interface Loot {
  id: number;
  kind: LootKind;
  value: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rest: boolean;
  /** Seconds it has lain (a bomb: its fuse burning). */
  age: number;
  /** Seconds before it may be taken (spilled gold flies out first). */
  free: number;
  /** A fire pot from a castle: it goes off the moment it comes down. */
  pot?: boolean;
}
export interface Cart {
  x: number;
  dir: 1 | -1;
  gold: number;
  blows: number;
  /** Seconds since it was last struck (it shakes), and since it broke open (−1: whole). */
  shaken: number;
  broken: number;
}
interface Mind {
  wait: number;
  goal: { x: number; y: number; what: "home" | "loot" | "cart" | "chase" | "raid" | "defend" | "idle" | "flee"; id?: number } | null;
  /** Seconds since something came into its club's reach. */
  ready: number;
}
export interface World {
  tick: number;
  seed: number;
  /** The gold that fills a castle, and the clock's limit in slices (0: none). */
  target: number;
  limit: number;
  bandits: [Bandit, Bandit];
  loot: Loot[];
  nextId: number;
  /** Seconds to the next piece falling, and the place across kept for its mirror (null: none owed). */
  nextDrop: number;
  mirror: { kind: LootKind; x: number } | null;
  cart: Cart | null;
  nextCart: number;
  cartFrom: 1 | -1;
  treasury: [number, number];
  /** Seconds each castle's gate is still shut against a raid. */
  locked: [number, number];
  over: boolean;
  minds: [Mind, Mind];
}
export type Happening =
  | { kind: "jump"; side: number }
  | { kind: "swing"; side: number }
  | { kind: "pickup"; side: number; value: number; what: LootKind; x: number; y: number }
  | { kind: "deposit"; side: number; amount: number }
  | { kind: "hit"; by: number; on: number; dropped: number }
  | { kind: "boom"; x: number; y: number; stunned: number[] }
  | { kind: "drop"; what: LootKind; x: number }
  | { kind: "cart"; dir: 1 | -1 }
  | { kind: "shed"; by: number; amount: number; x: number }
  | { kind: "broken"; by: number; x: number }
  | { kind: "raid"; by: number; amount: number }
  | { kind: "win"; side: number }
  | { kind: "time" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The world's own sequence of numbers (a match is the same for the same seed and the same hands). */
export function draw(world: World) {
  world.seed = (world.seed * 16807) % 2147483647;
  return (world.seed - 1) / 2147483646;
}
const between = (world: World, [lo, hi]: number[]) => lo + (hi - lo) * draw(world);
const bandit = (x: number, face: 1 | -1): Bandit => ({ x, y: 0, vx: 0, vy: 0, face, ground: true, carry: 0, stun: 0, swing: -1, struck: false, cool: 0, coyote: 0, buffer: 0, stride: 0 });
const mind = (): Mind => ({ wait: 0, goal: null, ready: 0 });
/** A match to `target` gold (with `seconds` on the clock, or 0 for none), each bandit before its own gate. */
export function createWorld(seed = 1, target = 100, seconds = 0): World {
  const world: World = {
    tick: 0,
    seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
    target,
    limit: Math.round(seconds / DT),
    bandits: [bandit(-GATE + 1.6, 1), bandit(GATE - 1.6, -1)],
    loot: [],
    nextId: 1,
    nextDrop: 1,
    mirror: null,
    cart: null,
    nextCart: CART.first,
    cartFrom: 1,
    treasury: [0, 0],
    locked: [0, 0],
    over: false,
    minds: [mind(), mind()],
  };
  world.cartFrom = draw(world) < 0.5 ? 1 : -1;
  return world;
}
/** The seconds left on the clock, or null when there is none. */
export const timeLeft = (world: World) => (world.limit ? Math.max(0, (world.limit - world.tick) * DT) : null);
/** The height of the highest ledge (or the road) under `x` that lies at or below `y`. */
export function surfaceUnder(x: number, y: number) {
  let top = 0;
  for (const p of PLATFORMS) if (x >= p.x0 && x <= p.x1 && p.y <= y + 1e-6 && p.y > top) top = p.y;
  return top;
}
/** Falling from `y0` to `y1` at `x`: the surface it comes down on between the two, or null. */
function landing(x: number, y0: number, y1: number) {
  let top: number | null = null;
  for (const p of PLATFORMS) if (x >= p.x0 && x <= p.x1 && y0 >= p.y - 1e-6 && y1 <= p.y && (top === null || p.y > top)) top = p.y;
  if (top === null && y1 <= 0) top = 0;
  return top;
}
function spawn(world: World, kind: LootKind, x: number, y: number, vx = 0, vy = 0, free = 0, value = KINDS[kind].value): Loot {
  const item: Loot = { id: world.nextId++, kind, value, x, y, vx, vy, rest: false, age: 0, free };
  world.loot.push(item);
  return item;
}
/** Gold thrown out from (x, y) as pouches and coins, flying up and to the sides (toward `way` when it is set). */
export function spill(world: World, amount: number, x: number, y: number, way = 0) {
  let left = amount;
  while (left > 0) {
    const kind: LootKind = left >= 3 && draw(world) < 0.5 ? "pouch" : "coin",
      side = way ? way * (0.4 + draw(world)) : draw(world) * 2 - 1;
    spawn(world, kind, clamp(x, -LOOT_MOST, LOOT_MOST), y, side * 1.8, 2.8 + draw(world) * 2.2, 0.6);
    left -= KINDS[kind].value;
  }
}
/** The kind of the next piece to fall, by the kinds' shares. */
function pickKind(world: World): LootKind {
  let r = draw(world) * 100;
  for (const kind of Object.keys(KINDS) as LootKind[]) {
    r -= KINDS[kind].share;
    if (r < 0) return kind;
  }
  return "coin";
}
/** A bomb goes off: whoever is within its blast is stunned and loses part of its sack. */
function explode(world: World, bomb: Loot, out: Happening[]) {
  const stunned: number[] = [];
  world.bandits.forEach((b, side) => {
    if (b.stun > 0 || Math.hypot(b.x - bomb.x, b.y + BODY.tall / 2 - bomb.y) > BLAST) return;
    stunned.push(side);
    const lost = Math.ceil(b.carry * BOMB_SHARE);
    b.carry -= lost;
    spill(world, lost, b.x, b.y + 0.8);
    b.stun = BOMB_STUN;
    b.swing = -1;
    b.vx = Math.sign(b.x - bomb.x || 1) * 1.8;
    b.vy = 3.9;
    b.ground = false;
  });
  world.loot.splice(world.loot.indexOf(bomb), 1);
  out.push({ kind: "boom", x: bomb.x, y: bomb.y, stunned });
}
/** A swing's blow: the other bandit, else the cart, else the other's gate. */
function blow(world: World, side: number, out: Happening[]) {
  const b = world.bandits[side],
    other = 1 - side,
    o = world.bandits[other],
    ahead = (x: number) => (x - b.x) * b.face;
  if (o.stun <= 0 && ahead(o.x) > -0.25 && ahead(o.x) < REACH && Math.abs(o.y - b.y) < 1.1) {
    const dropped = Math.ceil(o.carry * DROP_SHARE);
    o.carry -= dropped;
    spill(world, dropped, o.x, o.y + 0.8, b.face);
    o.stun = STUN;
    b.cool = Math.max(b.cool, HIT_COOL);
    o.swing = -1;
    o.vx = b.face * 2.3;
    o.vy = 3.6;
    o.ground = false;
    out.push({ kind: "hit", by: side, on: other, dropped });
    return;
  }
  const cart = world.cart;
  if (cart && cart.broken < 0 && b.y < 1.2 && ahead(cart.x) > -CART.half && ahead(cart.x) < REACH + CART.half) {
    cart.blows++;
    cart.shaken = 0;
    const last = cart.blows >= CART.blows || cart.gold <= CART.shed,
      amount = last ? cart.gold : CART.shed;
    cart.gold -= amount;
    spill(world, amount, cart.x, 1.1);
    if (last) {
      cart.broken = 0;
      out.push({ kind: "broken", by: side, x: cart.x });
    } else out.push({ kind: "shed", by: side, amount, x: cart.x });
    return;
  }
  // The other's gate: a little of its treasury falls out before it, and the castle drops a fire pot there.
  const gate = gateOf(other);
  if (b.ground && b.y < 0.1 && Math.abs(b.x - gate) < GATE_R + 0.2 && ahead(gate) > -0.6 && world.locked[other] <= 0 && world.treasury[other] > 0) {
    const amount = Math.min(RAID, world.treasury[other]);
    world.treasury[other] -= amount;
    world.locked[other] = RAID_LOCK;
    spill(world, amount, gate - Math.sign(gate) * 0.5, 0.9, -Math.sign(gate));
    spawn(world, "bomb", clamp(b.x, -LOOT_MOST, LOOT_MOST), 4.4).pot = true;
    out.push({ kind: "raid", by: side, amount });
  }
}
/** One slice of a bandit: its hands, its run and jump, its club, what it takes and what it brings home. */
function act(world: World, side: number, input: Input, out: Happening[]) {
  const b = world.bandits[side],
    stunned = b.stun > 0;
  b.stun = Math.max(0, b.stun - DT);
  b.cool = Math.max(0, b.cool - DT);
  b.buffer = input.jump && !stunned ? BUFFER : Math.max(0, b.buffer - DT);
  b.coyote = b.ground ? COYOTE : Math.max(0, b.coyote - DT);
  const want = stunned ? 0 : clamp(input.x, -1, 1),
    speed = runOf(b.carry),
    grip = (b.ground ? GRIP : AIR) * (stunned ? 0.25 : 1),
    goal = want * speed;
  b.vx += clamp(goal - b.vx, -grip * DT, grip * DT);
  if (want && !stunned) b.face = want > 0 ? 1 : -1;
  if (b.buffer > 0 && b.coyote > 0 && !stunned) {
    b.vy = JUMP;
    b.ground = false;
    b.buffer = b.coyote = 0;
    out.push({ kind: "jump", side });
  }
  // The club.
  if (input.strike && !stunned && b.cool <= 0 && b.swing < 0) {
    b.swing = 0;
    b.struck = false;
    b.cool = COOL;
    out.push({ kind: "swing", side });
  }
  if (b.swing >= 0) {
    b.swing += DT;
    if (!b.struck && b.swing >= SWING_HIT) {
      b.struck = true;
      blow(world, side, out);
    }
    if (b.swing >= SWING) b.swing = -1;
  }
  // The run and the fall.
  const y0 = b.y;
  b.x = clamp(b.x + b.vx * DT, -X_MOST, X_MOST);
  if (Math.abs(b.x) >= X_MOST) b.vx = 0;
  if (b.ground) {
    b.stride += Math.abs(b.vx) * DT;
    // Walked off a ledge.
    if (surfaceUnder(b.x, b.y) < b.y - 1e-6) b.ground = false;
  }
  if (!b.ground) {
    b.vy -= G * DT;
    b.y += b.vy * DT;
    if (b.vy <= 0) {
      const top = landing(b.x, y0, b.y);
      if (top !== null) {
        b.y = top;
        b.vy = 0;
        b.ground = true;
      }
    }
  }
  if (stunned) return;
  // What it touches is taken into the sack (a bomb goes off).
  for (const item of [...world.loot]) {
    if (item.free > 0 || Math.abs(item.x - b.x) > TAKE.across || item.y < b.y + TAKE.low || item.y > b.y + TAKE.high) continue;
    if (item.kind === "bomb") {
      explode(world, item, out);
      return;
    }
    const room = CAP - b.carry;
    if (room <= 0) break;
    const taken = Math.min(room, item.value);
    b.carry += taken;
    item.value -= taken;
    out.push({ kind: "pickup", side, value: taken, what: item.kind, x: item.x, y: item.y });
    if (item.value <= 0) world.loot.splice(world.loot.indexOf(item), 1);
  }
  // Home with it: the sack is emptied into the treasury.
  if (b.carry > 0 && b.ground && b.y < 0.05 && Math.abs(b.x - gateOf(side)) < GATE_R) {
    const amount = b.carry;
    b.carry = 0;
    world.treasury[side] += amount;
    out.push({ kind: "deposit", side, amount });
    if (!world.over && world.treasury[side] >= world.target) {
      world.over = true;
      out.push({ kind: "win", side });
    }
  }
}
/** One slice of everything that lies or falls. */
function fall(world: World, out: Happening[]) {
  for (const item of [...world.loot]) {
    item.free = Math.max(0, item.free - DT);
    if (item.rest) {
      item.age += DT;
      if (item.kind === "bomb" ? item.age >= FUSE : item.age >= LOOT_LIFE) {
        if (item.kind === "bomb") explode(world, item, out);
        else world.loot.splice(world.loot.indexOf(item), 1);
      }
      continue;
    }
    const y0 = item.y;
    item.vy = Math.max(-LOOT_FALL, item.vy - LOOT_G * DT);
    item.x += item.vx * DT;
    item.y += item.vy * DT;
    if (Math.abs(item.x) > LOOT_MOST) {
      item.x = Math.sign(item.x) * LOOT_MOST;
      item.vx = -item.vx * 0.5;
    }
    if (item.vy > 0) continue;
    const top = landing(item.x, y0, item.y - 0.12);
    if (top === null) continue;
    item.y = top + 0.12;
    if (item.pot) {
      explode(world, item, out);
      continue;
    }
    if (item.vy < -2.2) {
      item.vy = -item.vy * 0.32;
      item.vx *= 0.5;
    } else {
      item.vx = item.vy = 0;
      item.rest = true;
    }
  }
}
/** Where across the next piece falls: anywhere in the valley, the more often the nearer its middle (where the two meet). */
const dropX = (world: World) => (draw(world) < 0.5 ? -1 : 1) * DROP_REACH * Math.pow(draw(world), DROP_BIAS);
/** The sky's loot and the merchant's cart, each in its time. */
function supply(world: World, out: Happening[]) {
  world.nextDrop -= DT;
  if (world.nextDrop <= 0) {
    world.nextDrop = between(world, DROP_EVERY);
    // Each piece is followed by its like on the other half, so that neither side is favoured.
    const piece = world.mirror ?? { kind: pickKind(world), x: dropX(world) };
    world.mirror = world.mirror ? null : { kind: piece.kind, x: -piece.x };
    spawn(world, piece.kind, piece.x, DROP_FROM);
    out.push({ kind: "drop", what: piece.kind, x: piece.x });
  }
  const cart = world.cart;
  if (!cart) {
    world.nextCart -= DT;
    if (world.nextCart <= 0) {
      world.cart = { x: -world.cartFrom * (X_MOST + 2.2), dir: world.cartFrom, gold: CART.gold, blows: 0, shaken: 9, broken: -1 };
      out.push({ kind: "cart", dir: world.cartFrom });
      world.cartFrom = -world.cartFrom as 1 | -1;
    }
    return;
  }
  cart.shaken += DT;
  if (cart.broken >= 0) cart.broken += DT;
  // A cart just struck stands a moment; a broken one lies where it broke and is then cleared away.
  else if (cart.shaken > 0.6) cart.x += cart.dir * CART.pace * DT;
  if (cart.broken > 4 || Math.abs(cart.x) > X_MOST + 2.4) {
    world.cart = null;
    world.nextCart = between(world, CART.every);
  }
}
/**
 * One slice of the match: what falls and rolls, both bandits by their `inputs`, the clock. Returns what happened.
 * Once a castle is full (or the clock has run out) nothing moves any more.
 */
export function step(world: World, inputs: [Input, Input]): Happening[] {
  const out: Happening[] = [];
  if (world.over) return out;
  world.tick++;
  for (const side of [0, 1]) world.locked[side] = Math.max(0, world.locked[side] - DT);
  supply(world, out);
  // The sides take the slice's first turn by turns, so that neither is always first to a coin both touch.
  const first = world.tick % 2;
  act(world, first, inputs[first], out);
  act(world, 1 - first, inputs[1 - first], out);
  fall(world, out);
  if (!world.over && world.limit && world.tick >= world.limit) {
    world.over = true;
    out.push({ kind: "time" });
  }
  return out;
}

// ── The computer ──
/** How much more the loot it is already going for counts than any other. */
const STEADY = 1.5;
const ledgeAt = (x: number, y: number) => PLATFORMS.find((p) => Math.abs(p.y - y) < 0.35 && x >= p.x0 - 0.3 && x <= p.x1 + 0.3) ?? null;
/** The way to run and whether to jump, to come to (tx, ty) over the ledges. */
function route(b: Bandit, tx: number, ty: number): { x: number; jump: boolean } {
  let goal = tx,
    jump = false;
  if (ty > b.y + 0.5) {
    let ledge = ledgeAt(tx, ty);
    // Too high for one jump: by the ledge under it first.
    if (ledge && ledge.y - b.y > 1.8) {
      const above = ledge,
        under = PLATFORMS.find((p) => p.y < above.y - 0.5 && p.y > b.y + 0.5 && p.x0 < above.x1 && p.x1 > above.x0);
      if (under) {
        tx = clamp(tx, Math.max(under.x0, above.x0) + 0.25, Math.min(under.x1, above.x1) - 0.25);
        ledge = under;
      }
    }
    if (ledge) {
      goal = clamp(tx, ledge.x0 + 0.3, ledge.x1 - 0.3);
      jump = b.ground && b.x > ledge.x0 + 0.1 && b.x < ledge.x1 - 0.1 && Math.abs(b.x - goal) < 1.2;
    } else jump = b.ground && Math.abs(b.x - tx) < 0.6 && ty - b.y < 2.2;
  } else if (ty < b.y - 0.5 && b.ground) {
    // Down from a ledge: off its nearer end.
    const mine = PLATFORMS.find((p) => Math.abs(p.y - b.y) < 0.05 && b.x >= p.x0 && b.x <= p.x1);
    if (mine && tx > mine.x0 - 0.2 && tx < mine.x1 + 0.2) goal = tx - b.x >= 0 ? mine.x1 + 0.6 : mine.x0 - 0.6;
  }
  const d = goal - b.x;
  return { x: Math.abs(d) > 0.12 ? Math.sign(d) : 0, jump };
}
/** Where a piece of loot will lie (or lies). */
const restOf = (item: Loot) => (item.rest ? item.y - 0.12 : surfaceUnder(item.x, item.y));
/**
 * The computer's hands for side `side`: it thinks again every little while (its level's `think`) about where to go:
 * home with a full enough sack, after the best loot within reach, to the cart, after a laden rival, to its own gate
 * when it is raided; it steps away from a bomb it has seen, and strikes what has stood in its club's reach for its
 * level's `react`.
 */
export function think(world: World, side: number, level: Level = "normal"): Input {
  const L = LEVELS[level],
    b = world.bandits[side],
    other = 1 - side,
    o = world.bandits[other],
    m = world.minds[side],
    home = gateOf(side);
  if (b.stun > 0 || world.over) return IDLE;
  m.wait -= DT;
  if (m.wait <= 0 || !m.goal) {
    m.wait = L.think * (0.7 + 0.6 * draw(world));
    const left = timeLeft(world),
      near = (x: number, y: number) => Math.abs(x - b.x) + 1.3 * Math.abs(y - b.y);
    let best: Mind["goal"] = null,
      score = 0;
    // On its way home it keeps going, taking only what lies on the way.
    const homeward = m.goal?.what === "home" && b.carry > 0;
    for (const item of world.loot) {
      if (item.kind === "bomb") continue;
      if (homeward && Math.abs(item.x - home) > Math.abs(b.x - home) + 1) continue;
      const y = restOf(item);
      if (!L.climb && y > 2) continue;
      // What will be gone before it is reached is let be (the valley is long).
      if (item.rest && LOOT_LIFE - item.age < Math.abs(item.x - b.x) / runOf(b.carry) + 1) continue;
      // What the other will plainly reach first is left to it (the best players reckon so).
      if (level === "hard" && near(item.x, y) > 2.5 * (Math.abs(item.x - o.x) + 1.3 * Math.abs(y - o.y)) + 1 && o.stun <= 0) continue;
      // The better players weigh the way back too: with gold in the sack, loot farther from home counts for less.
      const away = L.thrift * (b.carry / CAP) * Math.max(0, Math.abs(item.x - home) - Math.abs(b.x - home)),
        // What it is already going for is kept unless something plainly better turns up (no dithering between two).
        s = ((m.goal?.id === item.id ? STEADY : 1) * Math.min(item.value, CAP - b.carry)) / (near(item.x, y) + 1.5 + away);
      if (s > score) [best, score] = [{ x: item.x, y, what: "loot", id: item.id }, s];
    }
    const cart = world.cart;
    if (cart && cart.broken < 0 && b.carry < CAP - 2) {
      const s = 4 / (Math.abs(cart.x - b.x) + 1.5);
      if (s > score) [best, score] = [{ x: cart.x - cart.dir * 0.2, y: 0, what: "cart" }, s];
    }
    // Home with a fuller sack the farther home is (the better players): the long way is not run for a little.
    const full = b.carry >= L.home + L.thrift * clamp((Math.abs(home - b.x) - 8) / 4, 0, 6) || b.carry >= CAP,
      wins = b.carry > 0 && world.treasury[side] + b.carry >= world.target,
      late = left !== null && b.carry > 0 && left < Math.abs(home - b.x) / (runOf(b.carry) * 0.85) + 2,
      close = b.carry >= 3 && Math.abs(home - b.x) < 3 && score < 0.6,
      idle = b.carry >= 4 && score < 0.25;
    if (full || wins || late || close || idle || (homeward && score < 0.5)) best = { x: home, y: 0, what: "home" };
    else {
      // A rival robbing my gate (its club up there, or the gate just struck) is seen off; one laden and near is chased.
      const robbing = Math.abs(o.x - home) < GATE_R + 0.8 && world.treasury[side] > 0 && o.stun <= 0 && (o.swing >= 0 || world.locked[side] > 0);
      if (level !== "easy" && robbing && Math.abs(o.x - b.x) < 14) best = { x: o.x, y: o.y, what: "defend" };
      else if (o.carry >= L.chase && o.stun <= 0.3 && near(o.x, o.y) < L.chaseFar && b.cool <= 0.2) best = { x: o.x, y: o.y, what: "chase" };
      else if (L.raid && !best && b.carry <= 6 && world.treasury[other] >= 8 && Math.abs(o.x - gateOf(other)) > 9 && Math.abs(b.x - gateOf(other)) < 14) best = { x: gateOf(other) - Math.sign(gateOf(other)) * 0.4, y: 0, what: "raid" };
    }
    // Nothing worth going for: it waits in the middle of its own half, where its share of the loot falls.
    m.goal = best ?? { x: home * 0.45, y: 0, what: "idle" };
    // A bomb seen coming down (or lying lit) near me: away from it first.
    if (L.dodge > 0 && draw(world) < L.dodge)
      for (const item of world.loot) {
        if (item.kind !== "bomb" || Math.abs(item.x - b.x) > BLAST + 0.5 || item.y - b.y > 4.5 || item.y < b.y - 1.5) continue;
        m.goal = { x: clamp(b.x + (b.x - item.x >= 0 ? 1 : -1) * (BLAST + 1.5), -X_MOST, X_MOST), y: b.y, what: "flee" };
        break;
      }
  }
  const goal = m.goal!,
    way = route(b, goal.x, goal.y),
    input: Input = { x: way.x * L.pace, jump: way.jump, strike: false };
  // A lit bomb lying on its way: it waits clear of the blast until it has gone off (backs off when too near).
  if (L.dodge > 0 && way.x !== 0)
    for (const item of world.loot) {
      const ahead = (item.x - b.x) * way.x;
      if (item.kind !== "bomb" || !item.rest || Math.abs(item.y - 0.12 - b.y) > 0.6 || ahead < -0.3 || ahead > BLAST + 0.9 || (goal.x - item.x) * way.x < -0.5) continue;
      input.x = ahead < BLAST + 0.2 ? -way.x * L.pace : 0;
      input.jump = false;
      break;
    }
  // The club: what has stood within its reach long enough is struck.
  const ahead = (x: number) => (x - b.x) * b.face,
    rival = o.stun <= 0 && o.carry >= L.strike && ahead(o.x) > 0 && ahead(o.x) < REACH - 0.15 && Math.abs(o.y - b.y) < 0.9,
    guard = goal.what === "defend" && o.stun <= 0 && ahead(o.x) > 0 && ahead(o.x) < REACH - 0.15 && Math.abs(o.y - b.y) < 0.9,
    cart = !!world.cart && world.cart.broken < 0 && b.y < 1 && ahead(world.cart.x) > -0.4 && ahead(world.cart.x) < REACH + CART.half - 0.3,
    gate = goal.what === "raid" && b.ground && Math.abs(b.x - gateOf(other)) < GATE_R && world.locked[other] <= 0 && world.treasury[other] > 0;
  if (rival || guard || cart || gate) {
    m.ready += DT;
    if (m.ready >= L.react && b.cool <= 0 && b.swing < 0) {
      input.strike = true;
      m.ready = 0;
      // After a raid's blow it runs from the fire pot.
      if (gate) [m.goal, m.wait] = [{ x: b.x - Math.sign(gateOf(other)) * (BLAST + 2), y: 0, what: "flee" }, 1.6];
    }
  } else m.ready = 0;
  // Beside the cart it stands and strikes rather than walk through it.
  if (goal.what === "cart" && cart) input.x = 0;
  // Turned the wrong way for the rival it means to strike: it turns.
  if ((goal.what === "chase" || goal.what === "defend") && Math.abs(o.x - b.x) < REACH && Math.abs(o.y - b.y) < 0.9 && ahead(o.x) < 0) input.x = Math.sign(o.x - b.x) * 0.3;
  return input;
}
