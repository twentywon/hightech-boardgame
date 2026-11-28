import { COLS, LIFE, MULTI, NARROW, PIERCE, SLOW, WIDE, layout, wall, type Kind } from "./rules";

/**
 * The brick breaker table, free of Three.js and DOM: the balls, the bat,
 * the wall of bricks and the prizes falling from it, stepped in fixed
 * slices so that the same inputs (and the same `random`) always give the
 * same game.
 */
export const HALF_X = 4.5,
  HALF_Z = 6,
  R = 0.17,
  BAT_Z = 5.2,
  BAT_DEEP = 0.16,
  BRICK_W = 0.94,
  BRICK_D = 0.42,
  DT = 1 / 120,
  /** How often a broken brick lets a prize fall, how fast it falls, and how long a timed one lasts. */
  DROP_CHANCE = 0.16,
  FALL = 2.6,
  LAST = 12,
  MAX_BALLS = 6;
export interface Brick {
  /** Where it stands when its row is not sliding, and where it is now. */
  home: number;
  x: number;
  z: number;
  row: number;
  col: number;
  kind: Kind;
  /** Hits it still takes; 0 once knocked out. Steel never loses any. */
  hits: number;
  sway: number;
}
export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
}
export interface World {
  level: number;
  balls: Ball[];
  bat: number;
  bricks: Brick[];
  /** Prizes on their way down. */
  items: { kind: number; x: number; z: number }[];
  /** A ball rests on the bat until it is sent off. */
  held: boolean;
  /** Seconds left of each timed prize. */
  wide: number;
  narrow: number;
  slow: number;
  pierce: number;
  time: number;
  random: () => number;
}
export type Happening =
  | { kind: "brick"; index: number; gone: boolean }
  | { kind: "wall" }
  | { kind: "bat" }
  | { kind: "lost" }
  | { kind: "clear" }
  | { kind: "drop"; item: number }
  | { kind: "item"; item: number };
export const brickAt = (col: number, row: number) => ({ x: col - (COLS - 1) / 2, z: -5 + row * 0.52 });
const HITS: Record<Kind, number> = { p: 1, h: 2, t: 3, s: 1, b: 1 };
/** Half the width of the bat now: the level's, wider or narrower while a prize lasts. */
export const batHalf = (world: World) => wall(world.level).bat * (world.wide > 0 ? 1.55 : 1) * (world.narrow > 0 ? 0.62 : 1);
/** How fast the balls go now. */
export const speedOf = (world: World) => wall(world.level).speed * (world.slow > 0 ? 0.68 : 1);
const rest = (world: World): Ball => ({ x: world.bat, z: BAT_Z - BAT_DEEP - R, vx: 0, vz: 0 });
export function createWorld(level: number, random: () => number = Math.random): World {
  const world: World = {
    level,
    balls: [],
    bat: 0,
    bricks: layout(level).map(({ col, row, kind, sway }) => ({ home: brickAt(col, row).x, ...brickAt(col, row), row, col, kind, hits: HITS[kind], sway })),
    items: [],
    held: true,
    wide: 0,
    narrow: 0,
    slow: 0,
    pierce: 0,
    time: 0,
    random,
  };
  world.balls = [rest(world)];
  return world;
}
/** True while a brick that can be broken still stands. */
export const standing = (world: World) => world.bricks.some((b) => b.hits > 0 && b.kind !== "s");
/** Sends the resting ball off, a little to the side the bat stands from the middle. */
export function launch(world: World) {
  if (!world.held) return;
  const angle = Math.max(-0.5, Math.min(0.5, world.bat * 0.12)) || 0.2,
    speed = speedOf(world);
  world.held = false;
  world.balls = [{ ...rest(world), vx: Math.sin(angle) * speed, vz: -Math.cos(angle) * speed }];
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
/** Which prize a brick lets fall: the bat-shortener only from the fourth wall on, a spare ball seldom. */
function prize(world: World) {
  const odds: [number, number][] = [[WIDE, 3], [MULTI, 3], [SLOW, 2], [PIERCE, 2], [LIFE, 1], [NARROW, world.level >= 4 ? 2 : 0]],
    total = odds.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = world.random() * total;
  for (const [kind, weight] of odds) {
    pick -= weight;
    if (pick < 0) return kind;
  }
  return WIDE;
}
/** Knocks a brick out (a bomb takes the bricks round it too) and tells of each that went. */
function shatter(world: World, index: number, out: Happening[]) {
  const brick = world.bricks[index];
  if (!brick.hits || brick.kind === "s") return;
  brick.hits = 0;
  out.push({ kind: "brick", index, gone: true });
  if (world.random() < DROP_CHANCE && world.items.length < 4) {
    const item = prize(world);
    world.items.push({ kind: item, x: brick.x, z: brick.z });
    out.push({ kind: "drop", item });
  }
  if (brick.kind === "b") world.bricks.forEach((other, i) => other.hits > 0 && Math.abs(other.col - brick.col) <= 1 && Math.abs(other.row - brick.row) <= 1 && shatter(world, i, out));
}
/** What a prize does once it is caught. */
function take(world: World, item: number) {
  if (item === WIDE) [world.wide, world.narrow] = [LAST, 0];
  else if (item === NARROW) [world.narrow, world.wide] = [LAST, 0];
  else if (item === SLOW) world.slow = LAST;
  else if (item === PIERCE) world.pierce = LAST * 0.7;
  else if (item === MULTI && !world.held) {
    // The first ball becomes three: two more leave it to either side.
    const from = world.balls[0];
    for (const turn of [-0.5, 0.5]) {
      if (world.balls.length >= MAX_BALLS) break;
      const cos = Math.cos(turn),
        sin = Math.sin(turn);
      world.balls.push({ x: from.x, z: from.z, vx: from.vx * cos - from.vz * sin, vz: from.vx * sin + from.vz * cos });
    }
  }
}
/** One slice of time with the bat brought to `target`; returns what happened in it. */
export function step(world: World, target: number): Happening[] {
  const out: Happening[] = [],
    half = batHalf(world),
    speed = speedOf(world);
  world.time += DT;
  for (const key of ["wide", "narrow", "slow", "pierce"] as const) world[key] = Math.max(0, world[key] - DT);
  world.bat = clamp(target, -(HALF_X - half), HALF_X - half);
  // Rows that slide go from side to side together.
  for (const brick of world.bricks) if (brick.sway) brick.x = brick.home + brick.sway * Math.sin(world.time * 0.9);
  if (world.held) {
    world.balls = [rest(world)];
    return out;
  }
  // Prizes fall straight toward me and are caught on the bat.
  world.items = world.items.filter((item) => {
    item.z += FALL * DT;
    if (item.z >= BAT_Z - BAT_DEEP - 0.2 && item.z <= BAT_Z + BAT_DEEP + 0.2 && Math.abs(item.x - world.bat) <= half + 0.35) {
      take(world, item.kind);
      out.push({ kind: "item", item: item.kind });
      return false;
    }
    return item.z < HALF_Z + 0.6;
  });
  world.balls = world.balls.filter((ball) => {
    // Its speed follows the table's (a slow prize, a split) while its direction stays.
    const now = Math.hypot(ball.vx, ball.vz) || 1;
    ball.vx *= speed / now;
    ball.vz *= speed / now;
    ball.x += ball.vx * DT;
    ball.z += ball.vz * DT;
    if (ball.x < -HALF_X + R || ball.x > HALF_X - R) {
      ball.x = clamp(ball.x, -HALF_X + R, HALF_X - R);
      ball.vx = ball.x < 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
      out.push({ kind: "wall" });
    }
    if (ball.z < -HALF_Z + R) {
      ball.z = -HALF_Z + R;
      ball.vz = Math.abs(ball.vz);
      out.push({ kind: "wall" });
    }
    // Off the bat the ball leaves at an angle set by where it struck: the middle sends it straight, the ends aside.
    if (ball.vz > 0 && ball.z + R >= BAT_Z - BAT_DEEP && ball.z - R <= BAT_Z + BAT_DEEP && Math.abs(ball.x - world.bat) <= half + R) {
      const angle = clamp((ball.x - world.bat) / half, -1, 1) * 1.05;
      ball.vx = Math.sin(angle) * speed;
      ball.vz = -Math.cos(angle) * speed;
      ball.z = BAT_Z - BAT_DEEP - R;
      out.push({ kind: "bat" });
    }
    if (ball.z > HALF_Z + 0.6) return false;
    for (let index = 0; index < world.bricks.length; index++) {
      const brick = world.bricks[index];
      if (!brick.hits) continue;
      const dx = ball.x - clamp(ball.x, brick.x - BRICK_W / 2, brick.x + BRICK_W / 2),
        dz = ball.z - clamp(ball.z, brick.z - BRICK_D / 2, brick.z + BRICK_D / 2);
      if (dx * dx + dz * dz >= R * R) continue;
      // A piercing ball goes straight through whatever can be broken.
      if (world.pierce > 0 && brick.kind !== "s") {
        shatter(world, index, out);
        continue;
      }
      // Thrown back from the face it met: a side when it came mostly from the side, else the front or back.
      if (Math.abs(dx) > Math.abs(dz)) ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
      else if (dz !== 0) ball.vz = dz > 0 ? Math.abs(ball.vz) : -Math.abs(ball.vz);
      else ball.vz = -ball.vz;
      if (brick.kind === "s") out.push({ kind: "wall" });
      else if (brick.hits > 1) {
        brick.hits--;
        out.push({ kind: "brick", index, gone: false });
      } else shatter(world, index, out);
      break;
    }
    return true;
  });
  if (!standing(world)) {
    out.push({ kind: "clear" });
    return out;
  }
  if (!world.balls.length) {
    // The last ball is gone: what was falling and what was lasting go with it.
    world.held = true;
    world.items = [];
    world.wide = world.narrow = world.slow = world.pierce = 0;
    world.balls = [rest(world)];
    out.push({ kind: "lost" });
  }
  return out;
}
