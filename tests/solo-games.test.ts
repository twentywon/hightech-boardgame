import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as peg from "../src/games/peg/rules";
import * as merge from "../src/games/merge/rules";
import * as blocks from "../src/games/blocks/rules";
import * as bricks from "../src/games/bricks/rules";
import { BAT_Z, DT, HALF_X, HALF_Z, R, batHalf, createWorld, launch, speedOf, step } from "../src/games/bricks/sim";
import * as marbleRules from "../src/games/marble/rules";
import * as pour from "../src/games/pour/rules";
import * as river from "../src/games/river/rules";
import * as hanoi from "../src/games/hanoi/rules";
import * as lights from "../src/games/lights/rules";
import * as mines from "../src/games/mines/rules";
import * as fruit from "../src/games/fruit/rules";
import * as box from "../src/games/fruit/sim";
import * as grill from "../src/games/grill/rules";
import * as fire from "../src/games/grill/sim";

const to = (point: number) => ({ from: -1, to: point, extra: -1 });

describe("peg solitaire", () => {
  test("every stage has its marbles and can be brought down to one", () => {
    const counts = Object.fromEntries(Object.keys(peg.STAGES).map((stage) => [stage, peg.left(peg.createGame(stage))]));
    expect(counts).toEqual({ full: 32, cross: 6, plus: 9, hearth: 11, pyramid: 16, diamond: 24 });
    for (const stage of Object.keys(peg.STAGES)) {
      let state = peg.createGame(stage);
      expect(peg.STAGES[stage].rows.every((row) => row.length === peg.SIZE)).toBe(true);
      const found = solve(state);
      expect(found, stage).not.toBeNull();
      for (const move of found!) state = peg.play(state, move)!;
      expect([stage, peg.left(state), state.winner]).toEqual([stage, 1, 0]);
    }
    // An unknown stage is the whole board.
    expect(peg.left(peg.createGame("nothing"))).toBe(32);
  });
  test("thirty-two marbles round an empty middle, and four jumps into it", () => {
    const state = peg.createGame();
    expect(peg.HOLES.length).toBe(33);
    expect(peg.left(state)).toBe(32);
    expect(state.pegs[peg.CENTRE]).toBe(false);
    expect(peg.moves(state).map((m) => m.to)).toEqual([peg.CENTRE, peg.CENTRE, peg.CENTRE, peg.CENTRE]);
  });
  test("a jump takes off the marble jumped over, and nothing else is a move", () => {
    const state = peg.createGame(),
      from = peg.holeAt(3, 1),
      next = peg.play(state, { from, to: peg.CENTRE, extra: -1 })!;
    expect([next.pegs[from], next.pegs[peg.holeAt(3, 2)], next.pegs[peg.CENTRE], peg.left(next)]).toEqual([false, false, true, 31]);
    expect(peg.peg.effect(next)).toMatchObject({ kind: "jump", removed: [peg.holeAt(3, 2)] });
    // Not diagonally, not over an empty hole, not onto a marble.
    expect(peg.play(state, { from: peg.holeAt(2, 2), to: peg.CENTRE, extra: -1 })).toBeNull();
    expect(peg.play(next, { from: peg.holeAt(3, 0), to: peg.holeAt(3, 2), extra: -1 })).toBeNull();
    expect(peg.play(next, { from: peg.holeAt(1, 2), to: peg.holeAt(3, 2), extra: -1 })).not.toBeNull();
    expect(peg.play(next, { from: peg.holeAt(3, 3), to: peg.holeAt(3, 1), extra: -1 })).toBeNull();
    expect(state.pegs[from]).toBe(true);
  });
  test("the board can be played down to one marble, and a dead end is a loss", () => {
    // The board can be solved: a search finds the jumps, and playing them leaves one marble.
    let state = peg.createGame();
    const found = solve(state);
    expect(found).not.toBeNull();
    for (const move of found!) state = peg.play(state, move)!;
    expect([peg.left(state), state.winner]).toEqual([1, 0]);
    // Jumps made carelessly run out with marbles to spare.
    let stuck = peg.createGame();
    while (stuck.winner === null) stuck = peg.play(stuck, peg.moves(stuck)[0])!;
    expect(stuck.winner).toBe(1);
    expect(peg.left(stuck)).toBeGreaterThan(1);
    expect(peg.peg.reason(stuck)).toMatch(/남았습니다/);
  });
});
/** Depth-first search with the positions already known to fail left out. */
function solve(start: peg.State) {
  const dead = new Set<string>(),
    path: { from: number; to: number; extra: number }[] = [];
  const go = (state: peg.State): boolean => {
    if (state.winner === 0) return true;
    const key = state.pegs.map((p) => (p ? 1 : 0)).join("");
    if (state.winner !== null || dead.has(key)) return false;
    for (const move of peg.moves(state)) {
      path.push(move);
      if (go(peg.play(state, move)!)) return true;
      path.pop();
    }
    dead.add(key);
    return false;
  };
  return go(start) ? path : null;
}

describe("2048", () => {
  const board = (cells: number[]): merge.State => ({ cells, score: 0, winner: null, last: null, ply: 0 });
  test("two tiles to start with, each a 2 or a 4", () => {
    const state = merge.createGame(seededRandom(3)),
      tiles = state.cells.filter(Boolean);
    expect(tiles.length).toBe(2);
    expect(tiles.every((v) => v === 2 || v === 4)).toBe(true);
  });
  test("tiles slide to the edge and equal ones join once a move", () => {
    // 2 2 2 2 to the left is 4 4, not 8; 2 2 2 is 4 2; 4 2 2 is 4 4.
    const { cells, gained, merged } = merge.slide([2, 2, 2, 2, 0, 2, 2, 2, 4, 2, 2, 0, 2, 0, 0, 2], merge.LEFT);
    expect(cells).toEqual([4, 4, 0, 0, 4, 2, 0, 0, 4, 4, 0, 0, 4, 0, 0, 0]);
    expect(gained).toBe(4 + 4 + 4 + 4 + 4);
    expect(merged.sort((a, b) => a - b)).toEqual([0, 1, 4, 9, 12]);
    expect(merge.slide([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0], merge.DOWN).cells).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 8, 0, 0, 0]);
    expect(merge.slide([0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], merge.RIGHT).cells.slice(0, 4)).toEqual([0, 0, 0, 4]);
  });
  test("a move that shifts nothing is refused; a move adds one tile and the score of what joined", () => {
    const state = board([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(merge.play(state, to(merge.UP), seededRandom(1))).toBeNull();
    expect(merge.moves(state).map((m) => m.to).sort()).toEqual([merge.RIGHT, merge.DOWN, merge.LEFT].sort());
    const next = merge.play(state, to(merge.LEFT), seededRandom(1))!;
    expect(next.cells[0]).toBe(4);
    expect(next.score).toBe(4);
    expect(next.cells.filter(Boolean).length).toBe(2);
    expect(next.last!.spawn).not.toBe(0);
    expect(state.cells[0]).toBe(2);
  });
  test("making 2048 wins, and a full board with nothing to join loses", () => {
    const won = merge.play(board([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), to(merge.LEFT), seededRandom(2))!;
    expect([won.winner, merge.best(won)]).toEqual([0, 2048]);
    expect(merge.moves(won)).toEqual([]);
    // One move is left; after it the board is full and nothing matches.
    const lost = merge.play(board([2, 4, 2, 4, 4, 2, 4, 2, 8, 4, 2, 4, 16, 32, 8, 0]), to(merge.RIGHT), () => 0)!;
    expect(lost.cells.slice(12)).toEqual([2, 16, 32, 8]);
    expect(lost.winner).toBe(1);
    expect(merge.merge.reason(lost)).toMatch(/더 밀 수 있는 곳이 없습니다/);
  });
  test("a game played at random always ends", () => {
    const random = seededRandom(7);
    let state = merge.createGame(random);
    for (let i = 0; i < 5000 && state.winner === null; i++) {
      const legal = merge.moves(state);
      state = merge.play(state, legal[Math.floor(random() * legal.length)], random)!;
    }
    expect(state.winner).not.toBeNull();
  });
});

describe("falling blocks", () => {
  const empty = (): blocks.State => ({ ...blocks.createGame(seededRandom(1)), grid: Array(blocks.W * blocks.H).fill(0) });
  test("every piece is four squares, and a turn four times round comes back", () => {
    for (let kind = 0; kind < blocks.KINDS; kind++) {
      const piece = { kind, rot: 0, x: 3, y: 5 },
        key = (p: blocks.Piece) => blocks.cells(p).map(([x, y]) => `${x},${y}`).sort().join(" ");
      expect(blocks.cells(piece).length).toBe(4);
      expect(new Set(blocks.cells(piece).map(([x, y]) => `${x},${y}`)).size).toBe(4);
      expect(key({ ...piece, rot: 4 % 4 })).toBe(key(piece));
    }
  });
  test("a piece slides until the wall and falls until the floor, where it stays", () => {
    let state: blocks.State = { ...empty(), piece: { kind: 1, rot: 0, x: 4, y: 0 } };
    for (let i = 0; i < 20; i++) state = blocks.play(state, to(blocks.LEFT)) ?? state;
    expect(state.piece!.x).toBe(0);
    expect(blocks.play(state, to(blocks.LEFT))).toBeNull();
    expect(blocks.moves(state).some((m) => m.to === blocks.LEFT)).toBe(false);
    for (let i = 0; i < blocks.H - 2; i++) state = blocks.play(state, to(blocks.TICK), seededRandom(2))!;
    expect(state.piece!.y).toBe(blocks.H - 2);
    expect(state.last!.locked).toBe(false);
    // The next fall of the clock finds no room: the square piece stays, and a new one comes in at the top.
    state = blocks.play(state, to(blocks.TICK), seededRandom(2))!;
    expect(state.last!.locked).toBe(true);
    expect(state.grid.filter(Boolean).length).toBe(4);
    expect([state.grid[(blocks.H - 1) * blocks.W], state.grid[(blocks.H - 2) * blocks.W + 1]]).toEqual([2, 2]);
    expect(state.piece!.y).toBeLessThanOrEqual(0);
  });
  test("a full row goes, what lay above comes down, and the score counts the level", () => {
    const state = empty(),
      grid = state.grid.slice();
    // The bottom row full but for its two left squares, and one square above it at the right.
    for (let x = 2; x < blocks.W; x++) grid[(blocks.H - 1) * blocks.W + x] = 3;
    grid[(blocks.H - 2) * blocks.W + 9] = 5;
    const dropped = blocks.play({ ...state, grid, piece: { kind: 1, rot: 0, x: 0, y: 0 }, lines: 9 }, to(blocks.DROP), seededRandom(4))!;
    expect(dropped.last).toMatchObject({ locked: true, cleared: [blocks.H - 1] });
    expect(dropped.lines).toBe(10);
    // Level 1 when the row went: 100, and two points a row for the drop of sixteen rows.
    expect(dropped.score).toBe(100 + 16 * 2);
    expect(blocks.level(dropped)).toBe(2);
    expect(blocks.interval(2)).toBeLessThan(blocks.interval(1));
    // What is left of the square piece and the lone square have come down a row.
    expect(dropped.grid[(blocks.H - 1) * blocks.W]).toBe(2);
    expect(dropped.grid[(blocks.H - 1) * blocks.W + 9]).toBe(5);
    expect(dropped.grid.filter(Boolean).length).toBe(3);
  });
  test("a turn against the wall is nudged aside, and a heap to the top ends the game", () => {
    // The bar upright against the right wall cannot lie down where it is; it is moved in.
    const upright: blocks.State = { ...empty(), piece: { kind: 0, rot: 1, x: 7, y: 4 } };
    expect(blocks.cells(upright.piece!).every(([x]) => x === 9)).toBe(true);
    const turned = blocks.play(upright, to(blocks.TURN))!;
    expect(turned).not.toBeNull();
    expect(blocks.cells(turned.piece!).every(([x]) => x >= 0 && x < blocks.W)).toBe(true);
    let state = blocks.createGame(seededRandom(5));
    const random = seededRandom(6);
    for (let i = 0; i < 400 && state.winner === null; i++) state = blocks.play(state, to(blocks.DROP), random)!;
    expect(state.winner).toBe(1);
    expect(state.piece).toBeNull();
    expect(blocks.moves(state)).toEqual([]);
    expect(blocks.blocks.reason(state)).toMatch(/꼭대기까지/);
  });
  test("the seven pieces all come before any comes again", () => {
    const random = seededRandom(9);
    let state = blocks.createGame(random);
    const seen = [state.piece!.kind];
    while (seen.length < 14) {
      state = blocks.play({ ...state, grid: Array(blocks.W * blocks.H).fill(0) }, to(blocks.DROP), random)!;
      seen.push(state.piece!.kind);
    }
    expect([...seen.slice(0, 7)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...seen.slice(7)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("brick breaker", () => {
  test("ten walls inside the table, each with something to break; bat and ball get harder", () => {
    expect(bricks.WALLS.length).toBe(bricks.LEVELS);
    for (let level = 1; level <= bricks.LEVELS; level++) {
      const wall = bricks.layout(level);
      expect(bricks.wall(level).rows.length).toBe(bricks.ROWS);
      expect(bricks.wall(level).rows.every((row) => row.length === bricks.COLS)).toBe(true);
      expect(wall.filter((b) => b.kind !== "s").length).toBeGreaterThan(15);
      expect(wall.every((b) => b.col >= 0 && b.col < bricks.COLS && b.row >= 0 && b.row < bricks.ROWS && "phtsb".includes(b.kind))).toBe(true);
      if (level > 1) {
        expect(bricks.wall(level).speed).toBeGreaterThan(bricks.wall(level - 1).speed);
        expect(bricks.wall(level).bat).toBeLessThan(bricks.wall(level - 1).bat);
      }
      // A row that slides keeps clear of the side walls.
      const world = createWorld(level, () => 0.99);
      for (let i = 0; i < 1500; i++) {
        world.time += DT * 4;
        for (const brick of world.bricks) {
          const x = brick.home + brick.sway * Math.sin(world.time * 0.9);
          expect(Math.abs(x) + 0.47).toBeLessThanOrEqual(HALF_X + 1e-9);
        }
      }
    }
    expect(bricks.layout(1).every((b) => b.kind === "p")).toBe(true);
    // The gimmicks come in one after another: hard bricks, bombs, steel, sliding rows, tough bricks.
    const first = (test: (level: number) => boolean) => Array.from({ length: bricks.LEVELS }, (_, i) => i + 1).find(test);
    expect(first((l) => bricks.layout(l).some((b) => b.kind === "h"))).toBe(3);
    expect(first((l) => bricks.layout(l).some((b) => b.kind === "b"))).toBe(4);
    expect(first((l) => bricks.layout(l).some((b) => b.kind === "s"))).toBe(5);
    expect(first((l) => bricks.layout(l).some((b) => b.sway !== 0))).toBe(6);
    expect(first((l) => bricks.layout(l).some((b) => b.kind === "t"))).toBe(7);
  });
  test("a brick scores by the level, a lost ball costs one of three, a prize is worth fifty, the tenth wall wins", () => {
    let state = bricks.createGame();
    state = bricks.play(state, to(bricks.BRICK))!;
    expect(state.score).toBe(10);
    state = bricks.play(state, to(bricks.CLEAR))!;
    expect([state.level, state.score, state.winner]).toEqual([2, 110, null]);
    state = bricks.play(state, to(bricks.BRICK))!;
    expect(state.score).toBe(130);
    state = bricks.play(state, to(bricks.ITEM + bricks.WIDE))!;
    expect([state.score, state.lives, state.item]).toEqual([180, 3, bricks.WIDE]);
    expect(bricks.bricks.hint(state)).toMatch(/넓은 막대/);
    // A spare ball is kept, five at the most.
    for (let i = 0; i < 4; i++) state = bricks.play(state, to(bricks.ITEM + bricks.LIFE))!;
    expect(state.lives).toBe(bricks.MAX_LIVES);
    expect(bricks.play(state, to(bricks.ITEM + 6))).toBeNull();
    for (let level = 2; level <= bricks.LEVELS; level++) state = bricks.play(state, to(bricks.CLEAR))!;
    expect([state.level, state.winner, state.item]).toEqual([bricks.LEVELS, 0, null]);
    let lost = bricks.createGame();
    for (let i = 0; i < bricks.LIVES; i++) lost = bricks.play(lost, to(bricks.LOST))!;
    expect([lost.lives, lost.winner]).toEqual([0, 1]);
    expect(bricks.play(lost, to(bricks.BRICK))).toBeNull();
  });
  test("the ball rests on the bat until sent off, stays inside the walls and knocks bricks out", () => {
    // No prize falls when the die never comes in under the chance.
    const world = createWorld(1, () => 0.99);
    step(world, 2);
    expect([world.held, world.balls[0].x]).toEqual([true, 2]);
    launch(world);
    expect(world.held).toBe(false);
    expect(world.balls[0].vz).toBeLessThan(0);
    let gone = 0,
      lost = false;
    // The bat follows the ball, so nothing is lost; ten seconds are enough to break something.
    for (let i = 0; i < 1200; i++)
      for (const event of step(world, world.balls[0].x)) {
        if (event.kind === "brick" && event.gone) gone++;
        if (event.kind === "lost") lost = true;
        expect(Math.abs(world.balls[0].x)).toBeLessThanOrEqual(HALF_X - R + 1e-9);
        expect(world.balls[0].z).toBeGreaterThanOrEqual(-HALF_Z + R - 1e-9);
      }
    expect(lost).toBe(false);
    expect(gone).toBeGreaterThan(0);
    expect(world.items).toEqual([]);
    expect(world.bricks.filter((b) => !b.hits).length).toBe(gone);
    // The speed never changes, whatever it bounces off.
    expect(Math.hypot(world.balls[0].vx, world.balls[0].vz)).toBeCloseTo(speedOf(world), 6);
  });
  test("a ball that passes the bat is lost and comes back to rest on it; the same inputs give the same game", () => {
    const run = () => {
      const world = createWorld(2, seededRandom(4));
      launch(world);
      const seen: string[] = [];
      for (let i = 0; i < 3000 && !seen.includes("lost"); i++) for (const event of step(world, -HALF_X)) seen.push(event.kind);
      return { world, seen };
    };
    const a = run(),
      b = run();
    expect(a.seen).toContain("lost");
    expect(a.world.held).toBe(true);
    step(a.world, 1);
    expect([a.world.balls.length, a.world.balls[0].x, a.world.balls[0].z < BAT_Z]).toEqual([1, 1, true]);
    expect(a.seen).toEqual(b.seen);
  });
  /** Sets one ball just under a brick, going straight up, and runs until something happens. */
  const strike = (world: ReturnType<typeof createWorld>, index: number) => {
    world.held = false;
    world.balls = [{ x: world.bricks[index].x, z: world.bricks[index].z + 0.6, vx: 0, vz: -speedOf(world) }];
    for (let i = 0; i < 60; i++) {
      const events = step(world, 0);
      if (events.length) return events;
    }
    return [];
  };
  test("hard and tough bricks take two and three hits, steel none, and the last breakable brick clears the wall", () => {
    const world = createWorld(7, () => 0.99),
      tough = world.bricks.findIndex((b) => b.kind === "t" && b.row === 4),
      steel = world.bricks.findIndex((b) => b.kind === "s");
    // All but one tough brick and the steel are taken away.
    world.bricks.forEach((b, i) => (b.hits = i === tough ? 3 : b.kind === "s" ? 1 : 0));
    expect(strike(world, tough)).toEqual([{ kind: "brick", index: tough, gone: false }]);
    expect(world.balls[0].vz).toBeGreaterThan(0);
    expect(strike(world, tough)).toEqual([{ kind: "brick", index: tough, gone: false }]);
    // Steel throws the ball back and stays; it does not keep the wall from being cleared.
    expect(strike(world, steel)).toEqual([{ kind: "wall" }]);
    expect(world.bricks[steel].hits).toBe(1);
    expect(strike(world, tough)).toEqual([{ kind: "brick", index: tough, gone: true }, { kind: "clear" }]);
  });
  test("a bomb takes the bricks round it, and bombs set each other off", () => {
    const world = createWorld(4, () => 0.99),
      bomb = world.bricks.findIndex((b) => b.kind === "b" && b.col === 4 && b.row === 1),
      before = world.bricks.filter((b) => b.hits > 0).length;
    // The bricks under it are taken away so that the ball reaches it.
    world.bricks.forEach((b) => b.col === 4 && b.row > 1 && (b.hits = 0));
    const under = world.bricks.filter((b) => b.col === 4 && b.row > 1).length,
      round = world.bricks.filter((b) => b.hits > 0 && Math.abs(b.col - 4) <= 1 && Math.abs(b.row - 1) <= 1).length,
      events = strike(world, bomb).filter((e) => e.kind === "brick");
    expect(round).toBeGreaterThan(1);
    expect(events.length).toBe(round);
    expect(world.bricks.filter((b) => b.hits > 0).length).toBe(before - under - round);
    // On the eighth wall the bombs stand close enough to go off one after another.
    const chain = createWorld(8, () => 0.99),
      start = chain.bricks.findIndex((b) => b.kind === "b" && b.row === 2 && b.col === 3);
    chain.bricks.forEach((b) => b.sway = 0);
    chain.bricks.forEach((b) => (b.x = b.home));
    chain.bricks.forEach((b) => b.col === 3 && b.row > 2 && (b.hits = 0));
    const fuses = chain.bricks.filter((b) => b.kind === "b" && b.col <= 3 && b.row <= 2);
    expect(fuses.length).toBe(3);
    strike(chain, start);
    expect(fuses.filter((b) => b.hits > 0).length).toBe(0);
  });
  test("prizes fall from broken bricks, are caught on the bat and do what they say", () => {
    // The die always comes in under the chance and picks the first prize: the wide bat.
    const world = createWorld(1, () => 0),
      index = world.bricks.findIndex((b) => b.row === 4 && b.col === 4),
      events = strike(world, index);
    expect(events).toEqual([{ kind: "brick", index, gone: true }, { kind: "drop", item: bricks.WIDE }]);
    expect(world.items.length).toBe(1);
    const narrow = batHalf(world);
    let caught: number | null = null;
    for (let i = 0; i < 1200 && caught === null; i++) for (const event of step(world, world.items[0]?.x ?? 0)) if (event.kind === "item") caught = event.item;
    expect(caught).toBe(bricks.WIDE);
    expect(batHalf(world)).toBeGreaterThan(narrow * 1.4);
    // It lasts a while and then wears off.
    world.wide = DT * 2;
    step(world, 0);
    step(world, 0);
    step(world, 0);
    expect(batHalf(world)).toBeCloseTo(narrow, 9);
    // A prize that is not caught is gone.
    const missed = createWorld(1, () => 0);
    strike(missed, missed.bricks.findIndex((b) => b.row === 4 && b.col === 0));
    for (let i = 0; i < 800; i++) step(missed, HALF_X);
    expect(missed.items.every((item) => item.x !== missed.bricks[0].home || item.z < HALF_Z + 0.6)).toBe(true);
    expect(missed.wide).toBe(0);
  });
  test("three balls from one, a ball that pierces, and nothing lost while one ball is left", () => {
    const world = createWorld(3, () => 0.99);
    launch(world);
    for (let i = 0; i < 30; i++) step(world, 0);
    world.items.push({ kind: bricks.MULTI, x: world.bat, z: BAT_Z - 0.3 });
    const events = Array.from({ length: 40 }, () => step(world, world.bat)).flat();
    expect(events).toContainEqual({ kind: "item", item: bricks.MULTI });
    expect(world.balls.length).toBe(3);
    // Two of them are let go by; the game goes on with the third.
    world.balls[1].z = world.balls[2].z = HALF_Z + 1;
    expect(step(world, world.balls[0].x).some((e) => e.kind === "lost")).toBe(false);
    expect(world.balls.length).toBe(1);
    // A piercing ball goes through the hard cap of the pyramid and the bricks behind it without turning back.
    const pierce = createWorld(3, () => 0.99),
      column = pierce.bricks.filter((b) => b.col === 4).length;
    pierce.held = false;
    pierce.pierce = 5;
    pierce.balls = [{ x: 0, z: 0, vx: 0, vz: -speedOf(pierce) }];
    let broken = 0;
    for (let i = 0; i < 120 && pierce.balls[0].vz < 0; i++) broken += step(pierce, 0).filter((e) => e.kind === "brick" && e.gone).length;
    expect(broken).toBe(column);
    expect(pierce.bricks.filter((b) => b.col === 4 && b.hits > 0).length).toBe(0);
  });
});

describe("falling blocks: levels", () => {
  test("the fall gets faster up to the fifth level and no faster after it", () => {
    for (let lv = 2; lv <= blocks.TOP_SPEED; lv++) expect(blocks.interval(lv)).toBeLessThan(blocks.interval(lv - 1));
    expect(blocks.interval(9)).toBe(blocks.interval(blocks.TOP_SPEED));
    expect(blocks.risePeriod(4)).toBe(0);
    expect(blocks.risePeriod(5)).toBeGreaterThan(blocks.risePeriod(8));
    expect(blocks.risePeriod(20)).toBe(3);
  });
  test("a game may begin at a higher level, and below the fifth no rubble comes", () => {
    const random = seededRandom(3);
    let state = blocks.createGame(random, 3);
    expect(blocks.level(state)).toBe(3);
    for (let i = 0; i < 8; i++) state = blocks.play({ ...state, grid: state.grid.map((v) => (v === blocks.RUBBLE ? v : 0)) }, to(blocks.DROP), random)!;
    expect(state.grid.includes(blocks.RUBBLE)).toBe(false);
    expect(blocks.level(blocks.createGame(random, 99))).toBe(blocks.START_LEVELS);
  });
  test("from the fifth level a row of rubble with one gap comes up every so many pieces", () => {
    const random = seededRandom(8);
    let state = blocks.createGame(random, 5),
      rows = 0;
    const period = blocks.risePeriod(5);
    for (let i = 1; i <= period * 2; i++) {
      // Only the rubble is kept, so that the heap never reaches the top.
      state = blocks.play({ ...state, grid: state.grid.map((v) => (v === blocks.RUBBLE ? v : 0)) }, to(blocks.DROP), random)!;
      if (state.last!.risen) rows++;
      expect(!!state.last!.risen).toBe(i % period === 0);
    }
    expect(rows).toBe(2);
    // Two rows at the floor, each full but for one square.
    for (const y of [blocks.H - 1, blocks.H - 2]) {
      const row = state.grid.slice(y * blocks.W, y * blocks.W + blocks.W);
      expect(row.filter((v) => v === blocks.RUBBLE).length).toBe(blocks.W - 1);
      expect(row.filter((v) => v === 0).length).toBe(1);
    }
    expect(state.winner).toBeNull();
  });
  test("rubble that pushes the heap out of the top ends the game", () => {
    const random = seededRandom(2);
    let state = blocks.createGame(random, 5);
    // A column standing to the very top, away from where the pieces come in.
    const grid = state.grid.slice();
    for (let y = 0; y < blocks.H; y++) grid[y * blocks.W] = 3;
    state = { ...state, grid, rise: blocks.risePeriod(5) - 1, piece: { kind: 1, rot: 0, x: 7, y: 0 } };
    state = blocks.play(state, to(blocks.DROP), random)!;
    expect(state.last!.risen).toBe(true);
    expect(state.winner).toBe(1);
  });
});

describe("marble shooting", () => {
  const tray = (marbles: [number, number][]): marbleRules.State => {
      const cells = Array.from({ length: marbleRules.W * marbleRules.H }, (_, i) => marbles.some(([x, y]) => y * marbleRules.W + x === i));
      // Each marble's colour is its place in the list, so that it can be followed.
      return { cells, tints: cells.map((_, i) => 1 + marbles.findIndex(([x, y]) => y * marbleRules.W + x === i)), winner: null, size: marbles.length, last: null, ply: 0 };
    },
    at = (x: number, y: number) => y * marbleRules.W + x;
  test("a marble is shot at one at least a hollow away, stops beside it, and that one rolls off", () => {
    const state = tray([[0, 0], [3, 0], [0, 1]]);
    // The one below is touching: it cannot be shot at; the one three along can.
    expect(marbleRules.moves(state)).toEqual([{ from: at(0, 0), to: at(3, 0), extra: -1 }, { from: at(3, 0), to: at(0, 0), extra: -1 }]);
    const next = marbleRules.play(state, { from: at(0, 0), to: at(3, 0), extra: -1 })!;
    expect(next.cells[at(2, 0)] && next.cells[at(0, 1)]).toBe(true);
    expect(marbleRules.count(next)).toBe(2);
    expect(next.last).toEqual({ dir: 1, rolls: [{ from: at(0, 0), to: at(2, 0) }, { from: at(3, 0), to: -1 }] });
    expect(marbleRules.play(state, { from: at(0, 0), to: at(0, 1), extra: -1 })).toBeNull();
    expect(state.cells[at(0, 0)]).toBe(true);
  });
  test("the knock runs down a line: touching marbles pass it on, the last one leaves", () => {
    // Shot from the left: it stops at 2, the two that touch pass the knock on, the one at 6 is struck by the one from 4.
    const next = marbleRules.play(tray([[0, 2], [3, 2], [4, 2], [6, 2]]), { from: at(0, 2), to: at(3, 2), extra: -1 })!;
    expect([0, 1, 2, 3, 4, 5, 6].filter((x) => next.cells[at(x, 2)])).toEqual([2, 3, 5]);
    // Each marble keeps its colour: the first is now at 2, the second has not moved, the third is at 5, the fourth is gone.
    expect([2, 3, 5].map((x) => next.tints[at(x, 2)])).toEqual([1, 2, 3]);
    expect(next.tints.filter(Boolean).length).toBe(3);
    expect(next.last!.rolls).toEqual([{ from: at(0, 2), to: at(2, 2) }, { from: at(4, 2), to: at(5, 2) }, { from: at(6, 2), to: -1 }]);
  });
  test("one marble left wins; marbles that cannot reach each other lose", () => {
    const won = marbleRules.play(tray([[1, 1], [1, 4]]), { from: at(1, 1), to: at(1, 4), extra: -1 })!;
    expect([marbleRules.count(won), won.winner]).toEqual([1, 0]);
    // After the shot the two that are left stand on different rows and columns.
    const lost = marbleRules.play(tray([[0, 0], [4, 0], [6, 5]]), { from: at(0, 0), to: at(4, 0), extra: -1 })!;
    expect([marbleRules.count(lost), lost.winner]).toEqual([2, 1]);
    expect(marbleRules.marble.reason(lost)).toMatch(/2개가 남았습니다/);
  });
  test("every tray laid at random has its marbles and can be solved", () => {
    for (const size of [4, 6, 8, 10, 12])
      for (const seed of [1, 2, 3]) {
        const start = marbleRules.createGame(size, seededRandom(seed * 31 + size));
        expect(marbleRules.count(start)).toBe(size);
        expect(start.tints.every((tint, i) => (start.cells[i] ? tint >= 1 && tint <= marbleRules.COLOURS : tint === 0))).toBe(true);
        expect(start.winner).toBeNull();
        // A search finds a way down to one.
        const dead = new Set<string>(),
          solve = (state: marbleRules.State): boolean => {
            if (state.winner === 0) return true;
            const key = state.cells.map((c) => (c ? 1 : 0)).join("");
            if (state.winner !== null || dead.has(key)) return false;
            if (marbleRules.moves(state).some((move) => solve(marbleRules.play(state, move)!))) return true;
            dead.add(key);
            return false;
          };
        expect(solve(start), `size ${size} seed ${seed}`).toBe(true);
      }
    expect(marbleRules.createGame(8, seededRandom(5)).cells).not.toEqual(marbleRules.createGame(8, seededRandom(6)).cells);
  });
  test("a hint is the first shot of a way down to one, and there is none once the tray is lost", () => {
    const start = marbleRules.createGame(8, seededRandom(21)),
      way = marbleRules.solve(start)!;
    expect(way.length).toBe(7);
    let state = start;
    for (const shot of way) state = marbleRules.play(state, shot)!;
    expect([marbleRules.count(state), state.winner]).toEqual([1, 0]);
    // From a tray that cannot be solved any more, nothing is offered.
    expect(marbleRules.solve(tray([[0, 0], [4, 0], [6, 5]]))).toBeNull();
    expect(marbleRules.solve(tray([[1, 1], [1, 4]]))).toEqual([{ from: at(1, 1), to: at(1, 4), extra: -1 }]);
  });
});

describe("water pouring", () => {
  const classic = (): pour.State => ({ caps: [8, 5, 3], amounts: [8, 0, 0], goal: { kind: "split", amount: 4 }, best: 7, winner: null, last: null, ply: 0 });
  test("a pour goes on until the one is empty or the other full, and nothing is lost", () => {
    let state = classic();
    expect(pour.moves(state)).toEqual([{ from: 0, to: 1, extra: -1 }, { from: 0, to: 2, extra: -1 }]);
    state = pour.play(state, { from: 0, to: 1, extra: -1 })!;
    expect(state.amounts).toEqual([3, 5, 0]);
    state = pour.play(state, { from: 1, to: 2, extra: -1 })!;
    expect([state.amounts, state.last, state.ply]).toEqual([[3, 2, 3], { from: 1, to: 2, amount: 3 }, 2]);
    // Into a full vessel, from an empty one, or into itself: no pour.
    expect(pour.play(state, { from: 0, to: 2, extra: -1 })).toBeNull();
    expect(pour.play(classic(), { from: 1, to: 0, extra: -1 })).toBeNull();
    expect(pour.play(state, { from: 0, to: 0, extra: -1 })).toBeNull();
    expect(state.amounts.reduce((a, b) => a + b)).toBe(8);
  });
  test("eight, five and three are shared four and four in seven pours, and no fewer", () => {
    let state = classic();
    const way = pour.solve(state)!;
    expect(way.length).toBe(7);
    for (const move of way) state = pour.play(state, move)!;
    expect([state.amounts, state.winner, state.ply]).toEqual([[4, 4, 0], 0, 7]);
    expect(pour.pouring.reason(state)).toMatch(/7번 만에.*가장 적게/);
    expect(pour.moves(state)).toEqual([]);
    // An amount in any vessel is the other kind of goal.
    const make: pour.State = { ...classic(), goal: { kind: "make", amount: 2 }, best: 2 };
    expect(pour.solve(make)!.length).toBe(2);
    const done = pour.solve(make)!.reduce((s, move) => pour.play(s, move)!, make);
    expect([done.winner, done.amounts.includes(2)]).toEqual([0, true]);
    expect(pour.goalText(make)).toBe("어느 그릇에든 2리터 만들기");
    expect(pour.goalText(classic())).toBe("8리터와 5리터 그릇에 4리터씩 나누기");
  });
  test("every puzzle drawn at random can be solved in the fewest pours it names, within its level's band", () => {
    const kinds = new Set<string>();
    for (let level = 1; level <= pour.BANDS.length; level++)
      for (let seed = 1; seed <= 12; seed++) {
        const start = pour.createGame(level, seededRandom(seed * 7 + level)),
          [low, high] = pour.BANDS[level - 1],
          way = pour.solve(start)!;
        kinds.add(start.goal.kind);
        expect(start.amounts).toEqual([start.caps[0], 0, 0]);
        expect(start.caps[0] > start.caps[1] && start.caps[1] > start.caps[2] && start.caps[2] >= 2).toBe(true);
        expect([way.length, start.best >= low && start.best <= high]).toEqual([start.best, true]);
        const end = way.reduce((s, move) => pour.play(s, move)!, start);
        expect(end.winner).toBe(0);
        if (start.goal.kind === "split") expect(end.amounts.slice(0, 2)).toEqual([start.caps[0] / 2, start.caps[0] / 2]);
        else expect(end.amounts).toContain(start.goal.amount);
      }
    // Both kinds of goal come up.
    expect([...kinds].sort()).toEqual(["make", "split"]);
  });
});

describe("river crossing", () => {
  const go = (state: river.State, crew: number[]) => {
    for (const i of crew) state = river.play(state, to(i))!;
    return river.play(state, to(river.GO))!;
  };
  test("the farmer rows; nothing crosses without him, and the boat holds him and one load", () => {
    const start = river.createGame(1, seededRandom(1));
    expect(start.actors.map((a) => a.role)[0]).toBe("farmer");
    expect([start.actors.length, start.seats, start.best]).toEqual([4, 2, 7]);
    // An empty boat does not leave, nor one with only a load in it.
    expect(river.moves(start).some((m) => m.to === river.GO)).toBe(false);
    let state = river.play(start, to(1))!;
    expect([state.aboard, state.ply, river.moves(state).some((m) => m.to === river.GO)]).toEqual([[1], 0, false]);
    state = river.play(state, to(0))!;
    // Full: a third cannot get in, but one may get out again.
    expect(river.play(state, to(2))).toBeNull();
    expect(river.play(state, to(1))!.aboard).toEqual([0]);
    expect(start.aboard).toEqual([]);
  });
  test("leaving the eater with what it eats is a failure, told and able to be taken back; the right way wins in seven", () => {
    const start = river.createGame(1, seededRandom(1)),
      failed = go(start, [0, 1]);
    // The farmer took the first load: the second is left with the third, which it eats.
    expect([failed.winner, failed.crossings]).toEqual([1, 1]);
    // Those it concerns are named for the table to point at: the eater and the eaten.
    expect(failed.culprits).toEqual([2, 3]);
    expect(start.culprits).toEqual([]);
    expect(river.river.reason(failed)).toMatch(/^실패! 농부가 없는 사이에/);
    expect(river.moves(failed)).toEqual([]);
    let state = start;
    for (const crew of river.solve(start)!) state = go(state, crew);
    expect([state.winner, state.crossings, state.actors.every((a) => a.side === 1)]).toEqual([0, 7, true]);
    expect(river.river.reason(state)).toMatch(/7번 만에.*가장 적게/);
  });
  test("wolves must not outnumber sheep on either bank, and couples must not be parted wrongly", () => {
    const flock = river.createGame(2, seededRandom(1)),
      wolves = flock.actors.flatMap((a, i) => (a.role === "wolf" ? [i] : [])),
      sheep = flock.actors.flatMap((a, i) => (a.role === "sheep" ? [i] : []));
    expect([flock.best, flock.seats]).toEqual([11, 2]);
    // Two sheep go: one sheep is left with three wolves.
    expect(go(flock, sheep.slice(0, 2)).trouble).toMatch(/늑대 3마리가 양 1마리보다/);
    expect(go(flock, sheep.slice(0, 2)).culprits).toEqual([...wolves, sheep[2]]);
    expect(go(flock, wolves.slice(0, 2)).winner).toBeNull();
    const pairs = river.createGame(3, seededRandom(1));
    expect(pairs.best).toBe(11);
    // A husband crosses with another's wife: in the boat she is with a husband not her own.
    expect(go(pairs, [0, 3]).trouble).toMatch(/부인이 남편 없이/);
    // Two husbands cross: their wives stay with the third husband.
    expect(go(pairs, [0, 2]).trouble).toMatch(/부인이 남편 없이/);
    expect(go(pairs, [1, 3]).winner).toBeNull();
  });
  test("every stage can be solved in the fewest crossings it names, and the hint leads there", () => {
    for (const stage of [1, 2, 3, 4])
      for (const seed of [1, 2, 3, 4]) {
        let state = river.createGame(stage, seededRandom(seed * 5 + stage));
        const best = state.best;
        expect(best).toBeGreaterThan(0);
        // Following the hint, press by press, to the end.
        for (let presses = 0; state.winner === null && presses < 400; presses++) state = river.play(state, river.hint(state)!)!;
        expect([state.winner, state.crossings]).toEqual([0, best]);
      }
    // From a failed state there is no hint.
    expect(river.hint(go(river.createGame(1, seededRandom(1)), [0, 1]))).toBeNull();
  });
});

describe("tower of Hanoi", () => {
  test("only the top disc moves, never onto a smaller one", () => {
    const start = hanoi.createGame(3);
    expect([start.pegs, start.best]).toEqual([[[3, 2, 1], [], []], 7]);
    expect(hanoi.moves(start).map((m) => [m.from, m.to])).toEqual([[0, 1], [0, 2]]);
    const one = hanoi.play(start, { from: 0, to: 2, extra: -1 })!;
    expect(one.pegs).toEqual([[3, 2], [], [1]]);
    // The second disc cannot go onto the smallest, and an empty peg gives nothing.
    expect(hanoi.play(one, { from: 0, to: 2, extra: -1 })).toBeNull();
    expect(hanoi.play(one, { from: 1, to: 0, extra: -1 })).toBeNull();
    expect(start.pegs[0]).toEqual([3, 2, 1]);
    expect([hanoi.createGame(1).discs, hanoi.createGame(99).discs]).toEqual([hanoi.MIN, hanoi.MAX]);
  });
  test("following the hint moves every tower in the fewest moves, from a detour as well", () => {
    for (let discs = hanoi.MIN; discs <= hanoi.MAX; discs++) {
      let state = hanoi.createGame(discs);
      while (state.winner === null) state = hanoi.play(state, hanoi.hint(state)!)!;
      expect([discs, state.ply, state.pegs[2].length]).toEqual([discs, 2 ** discs - 1, discs]);
      expect(hanoi.hint(state)).toBeNull();
      expect(hanoi.hanoi.reason(state)).toMatch(/^성공!.*가장 적게/);
    }
    // After a wrong first move the hint still leads home.
    let state = hanoi.play(hanoi.createGame(4), { from: 0, to: 2, extra: -1 })!;
    for (let i = 0; i < 40 && state.winner === null; i++) state = hanoi.play(state, hanoi.hint(state)!)!;
    expect(state.winner).toBe(0);
  });
});
describe("lights on", () => {
  test("a press turns over a lamp and those beside it, and twice undoes itself", () => {
    expect(lights.reach(3, 4).sort()).toEqual([1, 3, 4, 5, 7]);
    expect(lights.reach(3, 0).sort()).toEqual([0, 1, 3]);
    const lit = { size: 3, on: new Array(9).fill(true), best: 0, last: null, winner: null, ply: 0 } as lights.State,
      once = lights.play(lit, to(4))!;
    expect(once.on.flatMap((on, i) => (on ? [] : [i]))).toEqual([1, 3, 4, 5, 7]);
    expect(once.winner).toBeNull();
    // Every lamp lit again: that is the end.
    const twice = lights.play(once, to(4))!;
    expect([twice.on.every(Boolean), twice.winner]).toEqual([true, 0]);
    expect(lights.play(once, to(9))).toBeNull();
    expect(lit.on.every(Boolean)).toBe(true);
  });
  test("every board laid can be lit, in exactly the fewest presses it names", () => {
    for (let stage = 1; stage <= lights.SIZES.length; stage++)
      for (const seed of [1, 2, 3]) {
        let state = lights.createGame(stage, seededRandom(seed));
        const way = lights.solve(state.size, state.on)!;
        expect([state.size, state.on.every(Boolean)]).toEqual([lights.SIZES[stage - 1], false]);
        expect(way.length).toBe(state.best);
        expect(state.best).toBeGreaterThanOrEqual(state.size);
        // The hint is followed to the end.
        while (state.winner === null) state = lights.play(state, lights.hint(state)!)!;
        expect([stage, seed, state.ply, state.on.every(Boolean)]).toEqual([stage, seed, state.best, true]);
      }
  });
  test("the fewest presses are found where a board has more than one way", () => {
    // On the four by four some sets of presses change nothing: the search must not count such presses.
    const on = new Array(16).fill(true);
    for (const lamp of lights.reach(4, 5)) on[lamp] = !on[lamp];
    expect(lights.solve(4, on)).toEqual([5]);
    // A single dark lamp in the corner of the five by five cannot be lit.
    const corner = new Array(25).fill(true);
    corner[0] = false;
    expect(lights.solve(5, corner)).toBeNull();
  });
});
describe("minesweeper", () => {
  test("the first square is safe with those round it, and opening spreads over empty ground", () => {
    for (const seed of [1, 2, 3, 4]) {
      const start = mines.createGame(1),
        first = mines.play(start, to(27), seededRandom(seed))!;
      expect(start.mine).toBeNull();
      expect(first.mine!.filter(Boolean).length).toBe(10);
      expect([27, ...mines.around(first, 27)].some((i) => first.mine![i])).toBe(false);
      // At least the nine squares are open, and no mine among the open.
      expect(mines.opened(first)).toBeGreaterThanOrEqual(9);
      expect(first.open.some((o, i) => o && first.mine![i])).toBe(false);
      // Every opened square with nothing round it has all its neighbours open.
      first.open.forEach((o, i) => {
        if (o && mines.near(first, i) === 0) expect(mines.around(first, i).every((j) => first.open[j])).toBe(true);
      });
    }
    expect([mines.createGame(2).cols, mines.createGame(3).mines, mines.createGame(9).rows]).toEqual([12, 40, 12]);
  });
  test("flags guard a square, a mine ends the game, and opening everything else wins", () => {
    const first = mines.play(mines.createGame(1), to(0), seededRandom(5))!,
      mined = first.mine!.flatMap((m, i) => (m ? [i] : []));
    // Flag mode: the switch is no move; a flagged square cannot be opened.
    const mode = mines.play(first, to(mines.FLAG))!;
    expect([mode.flagging, mode.ply]).toEqual([true, first.ply]);
    const flagged = mines.play(mode, to(mined[0]))!,
      back = mines.play(flagged, to(mines.FLAG))!;
    expect([flagged.flag[mined[0]], mines.flags(flagged), back.flagging]).toEqual([true, 1, false]);
    expect(mines.play(back, to(mined[0]))).toBeNull();
    expect(mines.mines.hint(back)).toMatch(/남은 지뢰 9개/);
    // Stepping on another mine loses.
    const lost = mines.play(back, to(mined[1]))!;
    expect([lost.winner, lost.boom]).toEqual([1, mined[1]]);
    expect(mines.moves(lost)).toEqual([]);
    expect(mines.mines.reason(lost)).toMatch(/^지뢰를 밟았습니다/);
    // Opening every safe square wins.
    let state = first;
    for (let i = 0; i < state.open.length; i++) if (!state.mine![i] && !state.open[i]) state = mines.play(state, to(i))!;
    expect([state.winner, mines.opened(state)]).toEqual([0, 54]);
    expect(first.open).not.toBe(state.open);
  });
  test("a number with its flags in place opens the rest round it", () => {
    const first = mines.play(mines.createGame(1), to(0), seededRandom(5))!,
      // An open number with closed squares round it.
      cell = first.open.findIndex((o, i) => o && mines.near(first, i) > 0 && mines.around(first, i).some((j) => !first.open[j] && !first.mine![j])),
      round = mines.around(first, cell);
    // Without its flags it does nothing.
    expect(mines.play(first, to(cell))).toBeNull();
    let state = mines.play(first, to(mines.FLAG))!;
    for (const i of round) if (first.mine![i]) state = mines.play(state, to(i))!;
    state = mines.play(mines.play(state, to(mines.FLAG))!, to(cell))!;
    expect(round.every((i) => state.open[i] || state.flag[i])).toBe(true);
    expect(state.winner).not.toBe(1);
  });
});
describe("fruit merge", () => {
  const run = (world: box.World, seconds: number, aim = 0) => {
    const heard: box.Happening[] = [];
    for (let i = 0; i < seconds / box.DT; i++) heard.push(...box.step(world, aim));
    return heard;
  };
  test("the score grows with what merges, and the box overflowing ends the game", () => {
    let state = fruit.createGame();
    state = fruit.play(state, to(fruit.DROP))!;
    expect([state.drops, state.score]).toEqual([1, 0]);
    state = fruit.play(state, to(fruit.MERGE + 0))!;
    expect([state.score, state.largest]).toEqual([fruit.worth(0), 1]);
    // Two watermelons vanish: the largest kind stays the watermelon.
    state = fruit.play(state, to(fruit.MERGE + fruit.KINDS - 1))!;
    expect(state.largest).toBe(fruit.KINDS - 1);
    expect(fruit.play(state, to(fruit.MERGE + fruit.KINDS))).toBeNull();
    const over = fruit.play(state, to(fruit.OVER))!;
    expect([over.winner, fruit.moves(over)]).toEqual([1, []]);
    expect(fruit.fruit.reason(over)).toMatch(/^점수 \d+점!/);
    expect(fruit.RADII.every((r, i) => i === 0 || r > fruit.RADII[i - 1])).toBe(true);
  });
  test("two of a kind dropped on one another become the next kind, and the heap stays in the box", () => {
    // The hand always holds the smallest.
    const world = box.createWorld(() => 0);
    expect(box.drop(world)).toEqual([{ kind: "drop" }]);
    // Not again at once.
    expect(box.drop(world)).toEqual([]);
    run(world, 1.5);
    expect(world.fruits).toHaveLength(1);
    expect(world.fruits[0].y).toBeCloseTo(fruit.RADII[0], 1);
    box.drop(world);
    const heard = run(world, 1.5);
    expect(heard.filter((h) => h.kind === "merge")).toHaveLength(1);
    expect(world.fruits.map((f) => f.kind)).toEqual([1]);
    // Many drops in one place: everything stays between the walls and above the floor.
    for (let i = 0; i < 14; i++) {
      box.drop(world);
      run(world, 0.8, (i % 5) - 2);
    }
    for (const f of world.fruits) {
      expect(Math.abs(f.x)).toBeLessThanOrEqual(box.HALF - fruit.RADII[f.kind] + 1e-6);
      expect(f.y).toBeGreaterThanOrEqual(fruit.RADII[f.kind] - 1e-6);
    }
    // Nothing overlaps much once it has come to rest.
    run(world, 2);
    world.fruits.forEach((a, i) =>
      world.fruits.slice(i + 1).forEach((b) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((fruit.RADII[a.kind] + fruit.RADII[b.kind]) * 0.9)),
    );
  });
  test("fruit that stays above the line ends the game, and the same drops give the same box", () => {
    const play = () => {
      // Kinds that never match their neighbours pile up in one column.
      const kinds = [4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3];
      let k = 0;
      const world = box.createWorld(() => kinds[k++ % kinds.length] / box.HANDED + 0.01),
        heard: box.Happening[] = [];
      for (let i = 0; i < 40 && !world.ended; i++) {
        box.drop(world);
        heard.push(...run(world, 0.9, i % 2 ? 0.6 : -0.6));
      }
      return { world, heard };
    };
    const one = play(),
      two = play();
    expect(one.world.ended).toBe(true);
    expect(one.heard.filter((h) => h.kind === "over")).toHaveLength(1);
    expect(box.drop(one.world)).toEqual([]);
    expect(two.world.fruits.map((f) => [f.kind, f.x, f.y])).toEqual(one.world.fruits.map((f) => [f.kind, f.x, f.y]));
  });
});

describe("meat grill", () => {
  const wait = (world: fire.World, seconds: number) => {
    const heard: fire.Happening[] = [];
    for (let i = 0; i < Math.round(seconds / fire.DT); i++) heard.push(...fire.step(world));
    return heard;
  };
  /** Cooks the piece on a place until both sides are just right. */
  const cook = (world: fire.World, slot: number) => {
    const seconds = (fire.CUTS[world.slots[slot]!.cut].seconds / fire.HEAT[slot]) * 0.9;
    wait(world, seconds);
    fire.flip(world, slot);
    wait(world, seconds);
  };
  test("a piece is taken from its plate, cooks on the side that lies down, is turned and eaten for what both sides are worth", () => {
    const world = fire.createWorld(),
      seconds = fire.CUTS[0].seconds;
    expect(world.plates).toEqual([5, 5, 5, 5, 5]);
    // Laid without a place named: round the edge first.
    expect(fire.lay(world, 0)).toEqual([{ kind: "lay", slot: 1 }]);
    expect(world.plates[0]).toBe(4);
    wait(world, seconds * 0.9);
    const piece = world.slots[1]!;
    expect(piece.done[0]).toBeCloseTo(0.9, 1);
    expect(piece.done[1]).toBe(0);
    expect(fire.flip(world, 1)).toEqual([{ kind: "flip", slot: 1 }]);
    wait(world, seconds * 0.9);
    expect(piece.done[0]).toBeCloseTo(0.9, 1);
    expect(piece.done[1]).toBeCloseTo(0.9, 1);
    // Both sides just right: the most a piece is worth.
    expect(fire.take(world, 1)).toEqual([{ kind: "eat", slot: 1, raw: false, points: grill.BEST }]);
    expect(world.slots[1]).toBeNull();
    expect(fire.take(world, 1)).toEqual([]);
    expect(fire.flip(world, 1)).toEqual([]);
    expect([0.2, 0.6, 0.9, 1.2, 1.4].map(fire.grade)).toEqual([0, 1, 3, 1, 0]);
  });
  test("a piece may be turned again and again, laid where one likes and moved; the middle is hotter; an emptied plate is filled again", () => {
    const world = fire.createWorld();
    expect(fire.lay(world, 2, 0)).toEqual([{ kind: "lay", slot: 0 }]);
    // Not onto a place that is taken.
    expect(fire.lay(world, 1, 0)).toEqual([]);
    fire.lay(world, 2, 3);
    wait(world, 2);
    expect(world.slots[0]!.done[0]).toBeGreaterThan(world.slots[3]!.done[0] * 1.2);
    fire.flip(world, 3);
    fire.flip(world, 3);
    wait(world, 1);
    // Turned twice: the first side is down again and goes on cooking.
    expect(world.slots[3]!.done[1]).toBe(0);
    expect(world.slots[3]!.done[0]).toBeCloseTo(3 / fire.CUTS[2].seconds, 1);
    expect(fire.shift(world, 3, 0)).toBe(false);
    expect(fire.shift(world, 3, 5)).toBe(true);
    expect([world.slots[3], world.slots[5]!.cut]).toEqual([null, 2]);
    // The plate's last piece brings a fresh plateful.
    world.plates[4] = 1;
    expect(fire.lay(world, 4)).toHaveLength(1);
    expect(world.plates[4]).toBe(fire.PORTION);
  });
  test("a raw side is worth nothing, and a piece left burns where it lies", () => {
    const world = fire.createWorld();
    fire.lay(world, 0, 1);
    wait(world, fire.CUTS[0].seconds * 0.9);
    fire.flip(world, 1);
    expect(fire.take(world, 1)).toEqual([{ kind: "eat", slot: 1, raw: true, points: 0 }]);
    fire.lay(world, 0, 1);
    const heard = wait(world, fire.CUTS[0].seconds * fire.BURNT + 0.5);
    expect(heard.filter((h) => h.kind !== "second")).toEqual([{ kind: "burn", slot: 1 }]);
    // It stays, charred, taking up its place, until it is thrown away; it does not go into a wrap.
    expect(world.slots[1]!.burnt).toBe(true);
    wait(world, 30);
    expect(world.slots[1]!.done[0]).toBe(fire.COAL);
    expect(fire.fill(world, 1)).toEqual([]);
    expect(fire.take(world, 1)).toEqual([{ kind: "discard", slot: 1 }]);
    // A second is told each second.
    expect(wait(fire.createWorld(), 3).filter((h) => h.kind === "second")).toHaveLength(3);
  });
  test("a wrap is worth its pieces, and more for the leaf and each relish", () => {
    const world = fire.createWorld();
    // Nothing on the plate: nothing to eat.
    expect(fire.eatWrap(world)).toEqual([]);
    fire.lay(world, 0, 1);
    fire.lay(world, 2, 2);
    cook(world, 1);
    expect(fire.worth(world.slots[1]!)).toBe(grill.BEST);
    expect(fire.leaf(world)).toEqual([{ kind: "dress" }]);
    // One leaf, each relish once, two pieces at most.
    expect(fire.leaf(world)).toEqual([]);
    expect(fire.fill(world, 1)).toEqual([{ kind: "dress" }]);
    expect(world.slots[1]).toBeNull();
    expect(fire.relish(world, 1)).toEqual([{ kind: "dress" }]);
    expect(fire.relish(world, 1)).toEqual([]);
    expect(fire.relish(world, 9)).toEqual([]);
    fire.relish(world, 0);
    // Six for the piece, two for the wrap, one for each of two relishes.
    expect(fire.eatWrap(world)).toEqual([{ kind: "wrap", points: 10, meats: 1, leaf: true }]);
    expect(world.wrap).toEqual({ leaf: false, meats: [], relishes: [] });
    // Without a leaf the piece is worth only itself; a leaf with nothing cooked in it is worth nothing.
    world.slots[2] = { cut: 2, done: [0.9, 0.9], turned: true, burnt: false, age: 9, since: 1 };
    fire.fill(world, 2);
    fire.relish(world, 3);
    expect(fire.eatWrap(world)[0]).toMatchObject({ points: grill.BEST, leaf: false });
    fire.leaf(world);
    fire.relish(world, 2);
    expect(fire.eatWrap(world)[0]).toMatchObject({ points: 0, meats: 0 });
    for (const slot of [3, 4, 5]) world.slots[slot] = { cut: 0, done: [0.9, 0.9], turned: false, burnt: false, age: 9, since: 1 };
    fire.fill(world, 3);
    fire.fill(world, 4);
    expect(fire.fill(world, 5)).toEqual([]);
    fire.leaf(world);
    for (let k = 0; k < fire.RELISHES.length; k++) fire.relish(world, k);
    // The most a wrap can be worth.
    expect(fire.eatWrap(world)[0]).toMatchObject({ points: grill.FEAST });
  });
  test("a meal by the clock ends when the time is up; one without a clock goes on", () => {
    let state = grill.createGame();
    state = grill.play(state, to(grill.LAY))!;
    state = grill.play(state, to(grill.FLIP))!;
    state = grill.play(state, to(grill.DRESS))!;
    state = grill.play(state, to(grill.EAT + grill.BEST))!;
    state = grill.play(state, to(grill.EAT + 2))!;
    state = grill.play(state, to(grill.WRAP + 10))!;
    state = grill.play(state, to(grill.BURN))!;
    expect([state.score, state.eaten, state.perfect, state.wraps, state.burnt, state.winner]).toEqual([18, 2, 1, 1, 1, null]);
    expect(grill.play(state, to(grill.EAT + grill.BEST + 1))).toBeNull();
    expect(grill.play(state, to(grill.WRAP + grill.FEAST + 1))).toBeNull();
    for (let i = 0; i < grill.SECONDS; i++) state = grill.play(state, to(grill.TICK))!;
    expect([state.left, state.winner]).toEqual([0, 0]);
    expect(grill.grill.reason(state)).toMatch(/^점수 18점!/);
    let free = grill.createGame("2");
    for (let i = 0; i < grill.SECONDS + 75; i++) free = grill.play(free, to(grill.TICK))!;
    expect([free.endless, free.winner, free.gone, grill.clock(free.gone)]).toEqual([true, null, 195, "3:15"]);
    expect(grill.grill.hint(free)).toMatch(/지난 시간 3:15/);
  });
});
