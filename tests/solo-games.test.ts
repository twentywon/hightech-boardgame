import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as peg from "../src/games/peg/rules";
import * as merge from "../src/games/merge/rules";
import * as blocks from "../src/games/blocks/rules";
import * as bricks from "../src/games/bricks/rules";
import { BAT_Z, DT, HALF_X, HALF_Z, R, batHalf, createWorld, launch, speedOf, step } from "../src/games/bricks/sim";
import * as marbleRules from "../src/games/marble/rules";
import * as crateRules from "../src/games/crate/rules";

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
});

describe("warehouse keeper", () => {
  /** A warehouse from a drawing: # wall, . floor, o goal, c crate, k keeper, * crate on a goal. */
  const room = (rows: string[]): crateRules.State => {
    const { W, H } = crateRules,
      mark = (i: number) => rows[Math.floor(i / W)]?.[i % W] ?? "#",
      all = Array.from({ length: W * H }, (_, i) => i);
    return { wall: all.map((i) => mark(i) === "#"), goals: all.filter((i) => "o*".includes(mark(i))), crates: all.filter((i) => "c*".includes(mark(i))), keeper: all.find((i) => mark(i) === "k")!, face: 2, winner: null, last: null, ply: 0 };
  };
  test("the keeper walks, pushes one crate, and is stopped by walls and by two crates in a row", () => {
    const state = room(["#########", "#k.c.o..#", "#.cc....#", "#########"]);
    // Up is a wall; right and down are free.
    expect(crateRules.moves(state).map((m) => m.to)).toEqual([1, 2]);
    let next = crateRules.play(crateRules.play(state, to(1))!, to(1))!;
    expect([next.keeper % crateRules.W, next.crates.includes(crateRules.W + 4), next.last!.pushed]).toEqual([3, true, true]);
    next = crateRules.play(next, to(1))!;
    expect([next.crates.includes(crateRules.W + 5), crateRules.home(next), next.winner]).toEqual([true, 1, null]);
    // Down from the start, then right: two crates stand in a row and do not move.
    const below = crateRules.play(state, to(2))!;
    expect(crateRules.play(below, to(1))).toBeNull();
    expect(state.keeper).toBe(crateRules.W + 1);
  });
  test("every crate on its mark wins", () => {
    const won = crateRules.play(room(["#########", "#kco....#", "#########"]), to(1))!;
    expect([won.winner, crateRules.home(won)]).toEqual([0, 1]);
    expect(crateRules.moves(won)).toEqual([]);
    expect(crateRules.crate.reason(won)).toMatch(/1걸음/);
  });
  test("every warehouse laid out at random is closed in, has its crates off their marks and can be solved", () => {
    const { W, H, DX, DY } = crateRules;
    for (const count of [2, 3, 4, 5])
      for (const seed of [1, 2]) {
        const start = crateRules.createGame(count, seededRandom(seed * 17 + count));
        expect([start.crates.length, start.goals.length]).toEqual([count, count]);
        expect(new Set([...start.crates, start.keeper]).size).toBe(count + 1);
        expect(start.crates.some((c) => start.goals.includes(c))).toBe(false);
        for (const at of [...start.crates, ...start.goals, start.keeper]) expect(start.wall[at]).toBe(false);
        for (let x = 0; x < W; x++) expect(start.wall[x] && start.wall[(H - 1) * W + x]).toBe(true);
        for (let y = 0; y < H; y++) expect(start.wall[y * W] && start.wall[y * W + W - 1]).toBe(true);
        void DX;
        void DY;
        // A breadth-first search over keeper and crates finds a way to put them all home (small warehouses only).
        if (count > 3) continue;
        const key = (s: crateRules.State) => `${s.keeper}:${[...s.crates].sort((a, b) => a - b).join()}`,
          seen = new Set([key(start)]);
        let frontier = [start],
          solved = false;
        while (frontier.length && !solved && seen.size < 400000) {
          const next: crateRules.State[] = [];
          for (const state of frontier)
            for (const move of crateRules.moves(state)) {
              const after = crateRules.play(state, move)!;
              if (after.winner === 0) solved = true;
              if (!seen.has(key(after))) {
                seen.add(key(after));
                next.push(after);
              }
            }
          frontier = next;
        }
        expect(solved, `count ${count} seed ${seed}`).toBe(true);
      }
  });
});
