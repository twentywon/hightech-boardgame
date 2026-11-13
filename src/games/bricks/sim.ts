import { COLS, layout } from "./rules";

/**
 * The brick breaker table, free of Three.js and DOM: a ball, a bat and the
 * wall of bricks, stepped in fixed slices so that the same inputs always
 * give the same game.
 */
export const HALF_X = 4.5,
  HALF_Z = 6,
  R = 0.17,
  BAT_Z = 5.2,
  BAT_HALF = 0.85,
  BAT_DEEP = 0.16,
  BRICK_W = 0.94,
  BRICK_D = 0.42,
  DT = 1 / 120;
export interface Brick {
  x: number;
  z: number;
  row: number;
  /** Hits it still takes; 0 once knocked out. */
  hits: number;
  hard: boolean;
}
export interface World {
  level: number;
  ball: { x: number; z: number; vx: number; vz: number };
  bat: number;
  bricks: Brick[];
  /** The ball rests on the bat until it is sent off. */
  held: boolean;
  speed: number;
}
export type Happening = { kind: "brick"; index: number; gone: boolean } | { kind: "wall" } | { kind: "bat" } | { kind: "lost" } | { kind: "clear" };
export const brickAt = (col: number, row: number) => ({ x: col - (COLS - 1) / 2, z: -5 + row * 0.52 });
export function createWorld(level: number): World {
  return {
    level,
    ball: { x: 0, z: BAT_Z - BAT_DEEP - R, vx: 0, vz: 0 },
    bat: 0,
    bricks: layout(level).map(({ col, row, hits }) => ({ ...brickAt(col, row), row, hits, hard: hits > 1 })),
    held: true,
    speed: 6.2 + level * 0.55,
  };
}
/** Sends the resting ball off, a little to the side the bat was last moved from the middle. */
export function launch(world: World) {
  if (!world.held) return;
  const angle = Math.max(-0.5, Math.min(0.5, world.bat * 0.12)) || 0.2;
  world.held = false;
  world.ball.vx = Math.sin(angle) * world.speed;
  world.ball.vz = -Math.cos(angle) * world.speed;
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
/** One slice of time with the bat brought to `target`; returns what happened in it. */
export function step(world: World, target: number): Happening[] {
  const { ball } = world,
    out: Happening[] = [];
  world.bat = clamp(target, -(HALF_X - BAT_HALF), HALF_X - BAT_HALF);
  if (world.held) {
    ball.x = world.bat;
    ball.z = BAT_Z - BAT_DEEP - R;
    return out;
  }
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
  if (ball.vz > 0 && ball.z + R >= BAT_Z - BAT_DEEP && ball.z - R <= BAT_Z + BAT_DEEP && Math.abs(ball.x - world.bat) <= BAT_HALF + R) {
    const angle = clamp((ball.x - world.bat) / BAT_HALF, -1, 1) * 1.05;
    ball.vx = Math.sin(angle) * world.speed;
    ball.vz = -Math.cos(angle) * world.speed;
    ball.z = BAT_Z - BAT_DEEP - R;
    out.push({ kind: "bat" });
  }
  if (ball.z > HALF_Z + 0.6) {
    world.held = true;
    ball.vx = ball.vz = 0;
    out.push({ kind: "lost" });
    return out;
  }
  for (let index = 0; index < world.bricks.length; index++) {
    const brick = world.bricks[index];
    if (!brick.hits) continue;
    const dx = ball.x - clamp(ball.x, brick.x - BRICK_W / 2, brick.x + BRICK_W / 2),
      dz = ball.z - clamp(ball.z, brick.z - BRICK_D / 2, brick.z + BRICK_D / 2);
    if (dx * dx + dz * dz >= R * R) continue;
    // Thrown back from the face it met: a side when it came mostly from the side, else the front or back.
    if (Math.abs(dx) > Math.abs(dz)) ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
    else if (dz !== 0) ball.vz = dz > 0 ? Math.abs(ball.vz) : -Math.abs(ball.vz);
    else ball.vz = -ball.vz;
    brick.hits--;
    out.push({ kind: "brick", index, gone: brick.hits === 0 });
    if (world.bricks.every((b) => !b.hits)) out.push({ kind: "clear" });
    break;
  }
  return out;
}
