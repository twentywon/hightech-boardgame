import { DEN, DX, DY, H, PEPPERS, START, W, buildMaze } from "./rules";

/**
 * The maze in motion, free of Three.js and DOM: the mouse, the cats, the
 * crumbs and the chillies, stepped in fixed slices so that the same inputs
 * (and the same `random`) always give the same game. Everything moves from
 * the middle of one square to the middle of the next and may turn there.
 */
export const DT = 1 / 60,
  MOUSE_SPEED = 6,
  SCARED_SPEED = 3,
  /** How near the mouse and a cat must be to meet. */
  REACH = 0.6;
export interface Actor {
  /** The square it last left, the way it is going (-1 standing), and how far toward the next square (0–1). */
  x: number;
  y: number;
  dir: number;
  t: number;
}
export interface Cat extends Actor {
  /** Seconds it still waits in the basket. */
  wait: number;
  kind: number;
}
export interface World {
  level: number;
  wall: boolean[];
  crumbs: boolean[];
  peppers: boolean[];
  mouse: Actor;
  cats: Cat[];
  /** Seconds the cats are still afraid, and seconds everything stands still (after a catch, at the start). */
  scared: number;
  hold: number;
  left: number;
  random: () => number;
}
export type Happening = "crumb" | "pepper" | "cat" | "caught" | "clear";
export const catSpeed = (level: number) => 4.4 + level * 0.3;
export const scaredFor = (level: number) => 7 - level * 0.7;
/** Where an actor is, in squares. */
export const place = (a: Actor) => ({ x: a.x + (a.dir < 0 ? 0 : DX[a.dir] * a.t), y: a.y + (a.dir < 0 ? 0 : DY[a.dir] * a.t) });
const basket = (i: number): Cat => ({ x: DEN.x + (i % 3) - 1, y: DEN.y, dir: -1, t: 0, wait: 1 + i * 2.2, kind: i });
export function createWorld(level: number, random: () => number = Math.random): World {
  const wall = buildMaze(level),
    keep = (x: number, y: number) => !(y === DEN.y && Math.abs(x - DEN.x) <= 1) && !(x === DEN.x && y === DEN.y - 1) && !(x === START.x && y === START.y),
    peppers = wall.map((_, i) => PEPPERS.some((p) => p.y * W + p.x === i)),
    crumbs = wall.map((solid, i) => !solid && !peppers[i] && keep(i % W, Math.floor(i / W)));
  return {
    level,
    wall,
    crumbs,
    peppers,
    mouse: { ...START, dir: -1, t: 0 },
    cats: Array.from({ length: Math.min(4, 1 + level) }, (_, i) => basket(i)),
    scared: 0,
    hold: 1,
    left: crumbs.filter(Boolean).length,
    random,
  };
}
const free = (world: World, x: number, y: number, d: number) => !world.wall[(y + DY[d]) * W + x + DX[d]];
/** Moves an actor on; `arrive` is asked which way to go each time it reaches the middle of a square. */
function advance(world: World, a: Actor, distance: number, arrive: () => number) {
  if (a.dir < 0) {
    a.dir = arrive();
    a.t = 0;
    if (a.dir < 0) return;
  }
  a.t += distance;
  while (a.t >= 1) {
    a.t -= 1;
    a.x += DX[a.dir];
    a.y += DY[a.dir];
    a.dir = arrive();
    if (a.dir < 0) {
      a.t = 0;
      return;
    }
  }
  void world;
}
/** The way a cat takes at a square: toward where it is headed, or away from the mouse when it is afraid. It does not turn back unless it must. */
function prowl(world: World, cat: Cat) {
  const mouse = world.mouse,
    back = cat.dir < 0 ? -1 : (cat.dir + 2) % 4,
    open = [0, 1, 2, 3].filter((d) => free(world, cat.x, cat.y, d)),
    ways = open.filter((d) => d !== back);
  if (!open.length) return -1;
  if (!ways.length) return back;
  // Now and then, and always for the fourth cat, the way is left to chance.
  if (world.random() < (cat.kind === 3 ? 0.6 : 0.12)) return ways[Math.floor(world.random() * ways.length)];
  const ahead = mouse.dir < 0 ? 0 : 3,
    target =
      cat.kind === 1
        ? { x: mouse.x + (mouse.dir < 0 ? 0 : DX[mouse.dir] * ahead), y: mouse.y + (mouse.dir < 0 ? 0 : DY[mouse.dir] * ahead) }
        : cat.kind === 2 && Math.hypot(mouse.x - cat.x, mouse.y - cat.y) < 5
          ? { x: 1, y: H - 2 }
          : { x: mouse.x, y: mouse.y },
    far = (d: number) => (cat.x + DX[d] - target.x) ** 2 + (cat.y + DY[d] - target.y) ** 2,
    flee = (d: number) => -((cat.x + DX[d] - mouse.x) ** 2 + (cat.y + DY[d] - mouse.y) ** 2);
  return ways.reduce((best, d) => ((world.scared > 0 ? flee(d) < flee(best) : far(d) < far(best)) ? d : best), ways[0]);
}
function restart(world: World) {
  world.mouse = { ...START, dir: -1, t: 0 };
  world.cats = world.cats.map((_, i) => basket(i));
  world.scared = 0;
  world.hold = 1.2;
}
/** One slice of time with the mouse wanting to go `want` (-1 for no wish); returns what happened in it. */
export function step(world: World, want: number): Happening[] {
  const out: Happening[] = [],
    mouse = world.mouse;
  if (world.hold > 0) {
    world.hold = Math.max(0, world.hold - DT);
    return out;
  }
  world.scared = Math.max(0, world.scared - DT);
  // Turning straight back needs no corner.
  if (mouse.dir >= 0 && want === (mouse.dir + 2) % 4 && mouse.t > 0) {
    mouse.x += DX[mouse.dir];
    mouse.y += DY[mouse.dir];
    mouse.dir = want;
    mouse.t = 1 - mouse.t;
  }
  advance(world, mouse, MOUSE_SPEED * DT, () => {
    const i = mouse.y * W + mouse.x;
    if (world.crumbs[i]) {
      world.crumbs[i] = false;
      world.left--;
      out.push("crumb");
    }
    if (world.peppers[i]) {
      world.peppers[i] = false;
      world.scared = scaredFor(world.level);
      out.push("pepper");
    }
    return want >= 0 && free(world, mouse.x, mouse.y, want) ? want : mouse.dir >= 0 && free(world, mouse.x, mouse.y, mouse.dir) ? mouse.dir : -1;
  });
  if (world.left === 0) {
    out.push("clear");
    return out;
  }
  const at = place(mouse);
  for (const cat of world.cats) {
    if (cat.wait > 0) {
      cat.wait = Math.max(0, cat.wait - DT);
      continue;
    }
    advance(world, cat, (world.scared > 0 ? SCARED_SPEED : catSpeed(world.level)) * DT, () => prowl(world, cat));
    const where = place(cat);
    if (Math.hypot(where.x - at.x, where.y - at.y) >= REACH) continue;
    if (world.scared > 0) {
      // Caught while afraid: back to the basket for a while.
      Object.assign(cat, basket(cat.kind), { wait: 3 });
      out.push("cat");
    } else {
      restart(world);
      out.push("caught");
      return out;
    }
  }
  return out;
}
