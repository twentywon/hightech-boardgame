/**
 * Table football as it is played on a table with rods: the ball runs free,
 * each side slides its four rods of figures across the table and swings
 * them to kick. Everything here is plain arithmetic stepped in small slices,
 * so that the table on screen and the tests run the same game.
 */
export const HALF_X = 3,
  HALF_Z = 5,
  GOAL = 1.05,
  BALL_R = 0.15,
  FOOT_R = 0.2,
  DT = 1 / 120,
  MAX_SPEED = 13,
  /** How long a swing lasts, in seconds, and how far forward the foot reaches. */
  SWING = 0.26,
  REACH = 0.42;
export interface Rod {
  side: 0 | 1;
  /** Where the rod crosses the table. */
  z: number;
  /** Its figures' places across the table when the rod is centred. */
  figures: number[];
  /** How far the rod can slide either way. */
  travel: number;
}
const rod = (side: 0 | 1, z: number, count: number): Rod => {
  const gap = (HALF_X * 2) / (count + 1),
    figures = Array.from({ length: count }, (_, i) => -HALF_X + gap * (i + 1));
  // The outermost figure stops at the wall; a keeper alone stays in front of its goal.
  return { side, z, figures, travel: count === 1 ? GOAL + 0.1 : HALF_X - FOOT_R - figures[count - 1] };
};
/** Side 0 defends the near goal (z > 0) and shoots toward -z. Keeper, two backs, five in midfield, three forwards. */
export const RODS: Rod[] = [rod(0, 4.3, 1), rod(0, 3.1, 2), rod(1, 1.85, 3), rod(0, 0.62, 5), rod(1, -0.62, 5), rod(0, -1.85, 3), rod(1, -3.1, 2), rod(1, -4.3, 1)];
export interface World {
  ball: { x: number; z: number; vx: number; vz: number };
  /** How far each side has slid its rods, -1 to 1 of their travel, and how fast that is changing. */
  slide: [number, number];
  slideSpeed: [number, number];
  /** Seconds since each side began its swing, or -1 when the figures hang straight. */
  swing: [number, number];
  /** Seconds the ball has lain nearly still. */
  idle: number;
  /** Seconds played since the ball was dropped. */
  clock: number;
  /** Set when a foot or a wall has just struck the ball hard; whoever plays the sound clears it. */
  hit: boolean;
}
export const createWorld = (toward: 0 | 1 = 0, nudge = 0): World => ({
  // The ball is dropped in the middle and rolls toward the side that is to have it.
  ball: { x: nudge, z: 0, vx: nudge * 2, vz: toward === 0 ? 1.6 : -1.6 },
  slide: [0, 0],
  slideSpeed: [0, 0],
  swing: [-1, -1],
  idle: 0,
  clock: 0,
  hit: false,
});
/** What a side asks of its rods in a slice: where to slide to (-1 to 1) and whether to kick. */
export interface Input {
  target: number;
  kick: boolean;
  /** Share of the full sliding speed this hand has; 1 when left out. */
  pace?: number;
}
/** How far forward of the rod the feet are during a swing, and how fast they are moving: back a little, then through. */
export function foot(swing: number) {
  if (swing < 0 || swing >= SWING) return { reach: 0, speed: 0 };
  const t = swing / SWING,
    // Drawn back for the first quarter, driven forward to the half, then let fall.
    reach = t < 0.25 ? -0.5 * (t / 0.25) : t < 0.55 ? -0.5 + 1.5 * ((t - 0.25) / 0.3) : 1 - (t - 0.55) / 0.45,
    speed = t < 0.25 ? -0.5 / 0.25 : t < 0.55 ? 1.5 / 0.3 : -1 / 0.45;
  return { reach: reach * REACH, speed: (speed * REACH) / SWING };
}
/** How fast a side can slide its rods, in travels per second. */
export const SLIDE_SPEED = 3.2;
/** Advances the table by one slice. Returns the side that scored in it, or null. */
export function step(world: World, inputs: [Input, Input]): 0 | 1 | null {
  const ball = world.ball;
  world.clock += DT;
  for (const side of [0, 1] as const) {
    const wanted = Math.max(-1, Math.min(1, inputs[side].target)),
      most = SLIDE_SPEED * DT * (inputs[side].pace ?? 1),
      move = Math.max(-most, Math.min(most, wanted - world.slide[side]));
    world.slide[side] += move;
    world.slideSpeed[side] = move / DT;
    if (world.swing[side] >= 0) {
      world.swing[side] += DT;
      if (world.swing[side] >= SWING) world.swing[side] = -1;
    } else if (inputs[side].kick) world.swing[side] = 0;
  }
  // The cloth slows the ball a little.
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed > 0) {
    const slowed = Math.max(0, speed - 0.55 * DT),
      capped = Math.min(slowed, MAX_SPEED);
    ball.vx *= capped / speed;
    ball.vz *= capped / speed;
  }
  ball.x += ball.vx * DT;
  ball.z += ball.vz * DT;
  // Feet.
  for (const r of RODS) {
    const kick = foot(world.swing[r.side]),
      forward = r.side === 0 ? -1 : 1,
      fz = r.z + kick.reach * forward,
      fvz = kick.speed * forward,
      fvx = world.slideSpeed[r.side] * r.travel;
    for (const base of r.figures) {
      const fx = base + world.slide[r.side] * r.travel,
        dx = ball.x - fx,
        dz = ball.z - fz,
        dist = Math.hypot(dx, dz),
        reach = BALL_R + FOOT_R;
      if (dist >= reach || dist === 0) continue;
      const nx = dx / dist,
        nz = dz / dist,
        // The ball's speed as the foot sees it.
        closing = (ball.vx - fvx) * nx + (ball.vz - fvz) * nz;
      ball.x = fx + nx * reach;
      ball.z = fz + nz * reach;
      if (closing < 0) {
        if (closing < -2.5) world.hit = true;
        ball.vx -= 1.6 * closing * nx;
        ball.vz -= 1.6 * closing * nz;
      }
    }
  }
  // Walls, with the goal mouths open at each end.
  if (ball.x < -HALF_X + BALL_R) {
    ball.x = -HALF_X + BALL_R;
    ball.vx = Math.abs(ball.vx) * 0.85;
  } else if (ball.x > HALF_X - BALL_R) {
    ball.x = HALF_X - BALL_R;
    ball.vx = -Math.abs(ball.vx) * 0.85;
  }
  for (const end of [-1, 1]) {
    if (ball.z * end <= HALF_Z - BALL_R) continue;
    if (Math.abs(ball.x) < GOAL - BALL_R * 0.5) {
      if (ball.z * end > HALF_Z + BALL_R) return end < 0 ? 0 : 1;
    } else {
      ball.z = end * (HALF_Z - BALL_R);
      ball.vz = -end * Math.abs(ball.vz) * 0.85;
    }
  }
  // A ball that has come to rest where nobody can reach it is set rolling again.
  world.idle = Math.hypot(ball.vx, ball.vz) < 0.35 ? world.idle + DT : 0;
  if (world.idle > 2.2) {
    ball.vx = -Math.sign(ball.x || 1) * 1.2;
    ball.vz = (ball.z > 0 ? -1 : 1) * 1.5;
    world.idle = 0;
  }
  return null;
}
/** How quick and how sure each level of computer is: share of the slide speed, how near the ball must be to kick, and how often it kicks when it could. */
export const SKILL = {
  easy: { pace: 0.45, eye: 0.34, will: 0.035 },
  normal: { pace: 0.7, eye: 0.3, will: 0.09 },
  hard: { pace: 1, eye: 0.26, will: 0.22 },
} as const;
/**
 * What a computer side does in a slice: it slides so that the figure nearest
 * the ball, on the rod the ball is coming to, stands in its way, and swings
 * when the ball is just in front of a foot.
 */
export function steer(world: World, side: 0 | 1, level: keyof typeof SKILL, random: () => number = Math.random): Input {
  const { ball } = world,
    skill = SKILL[level],
    forward = side === 0 ? -1 : 1,
    mine = RODS.filter((r) => r.side === side),
    // The rod the ball will meet next: the nearest one it has not yet passed, else the nearest behind it.
    ahead = mine.filter((r) => (ball.z - r.z) * forward > -0.25).sort((a, b) => Math.abs(a.z - ball.z) - Math.abs(b.z - ball.z))[0],
    rod = ahead ?? mine.slice().sort((a, b) => Math.abs(a.z - ball.z) - Math.abs(b.z - ball.z))[0];
  // It meets the ball a little off the middle of the foot, now to one side and now to the other, so that the ball leaves at an angle.
  const aimed = ball.x + 0.13 * Math.sin(world.clock * 1.9 + side * 2.1);
  let best = world.slide[side],
    nearest = Infinity;
  for (const base of rod.figures) {
    const wanted = (aimed - base) / rod.travel;
    if (Math.abs(wanted) <= 1 && Math.abs(wanted - world.slide[side]) < nearest) {
      nearest = Math.abs(wanted - world.slide[side]);
      best = wanted;
    }
  }
  const within = mine.some((r) => {
    const ahead = (r.z - ball.z) * forward * -1;
    return ahead > -0.05 && ahead < BALL_R + FOOT_R + 0.22 && r.figures.some((base) => Math.abs(base + world.slide[side] * r.travel - ball.x) < skill.eye);
  });
  return { target: best, kick: within && random() < skill.will, pace: skill.pace };
}
