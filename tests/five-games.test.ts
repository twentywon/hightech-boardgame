import { describe, expect, test } from "vitest";
import type { Move, PointGame } from "../src/games/points/types";
import { choose } from "../src/games/points/ai";
import { HOLES, HOME, starHop, createGame as createStar, moves as starMoves, play as starPlay } from "../src/games/starhop/rules";
import { ludo, createGame as createLudo, moves as ludoMoves, play as ludoPlay } from "../src/games/ludo/rules";
import { pool, createGame as createPool, moves as poolMoves, CUE, HEAD, free, placeCode, placeOf, spotFor } from "../src/games/pool/rules";
import { indian, createGame as createIndian, pot, most, CALL, DECIDE, DOWN, FOLD, NEXT, READY, ROUNDS, START_CHIPS, UP } from "../src/games/indian/rules";
import { foosball, createGame as createFoosball, play as goal, moves as goalMoves, GOALS } from "../src/games/foosball/rules";
import { BALL_R, HALF_X, HALF_Z, MAX_SLIDE, RODS, createWorld, foot, offset, steer, step, SWING } from "../src/games/foosball/sim";

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** Plays a game with its own computer on both sides; every move offered must be accepted and leave its input alone. */
function playOut<S>(game: PointGame<S>, start: S, limit: number, random: () => number) {
  let state = start,
    plies = 0;
  while (game.winner(state) === null && plies < limit) {
    const legal = game.moves(state);
    expect(legal.length).toBeGreaterThan(0);
    const pick: Move = game.choose?.(state, "normal", random) ?? legal[Math.floor(random() * legal.length)],
      before = JSON.stringify(state),
      next = game.play(state, pick, random);
    expect(next).not.toBeNull();
    expect(JSON.stringify(state)).toBe(before);
    state = next!;
    plies++;
  }
  return { state, plies };
}
describe("chinese checkers", () => {
  test("the star has 121 holes and ten marbles a side in opposite points", () => {
    expect(HOLES.length).toBe(121);
    expect(HOME[0].length).toBe(10);
    expect(HOME[1].length).toBe(10);
    const state = createStar();
    expect(state.cells.filter((c) => c === 0).length).toBe(10);
    expect(state.cells.filter((c) => c === 1).length).toBe(10);
  });
  test("a marble moves only to an empty hole, and a move of the other side is refused", () => {
    const state = createStar(),
      legal = starMoves(state);
    expect(legal.length).toBeGreaterThan(0);
    for (const m of legal) {
      expect(state.cells[m.from]).toBe(0);
      expect(state.cells[m.to]).toBeNull();
    }
    expect(starPlay(state, { from: HOME[1][0], to: legal[0].to, extra: -1 })).toBeNull();
    const next = starPlay(state, legal[0])!;
    expect(next.turn).toBe(1);
    expect(next.cells.filter((c) => c === 0).length).toBe(10);
  });
  test("a game between two computers keeps ten marbles each", () => {
    const { state } = playOut(starHop, createStar(), 120, seeded(3));
    expect(state.cells.filter((c) => c === 0).length).toBe(10);
    expect(state.cells.filter((c) => c === 1).length).toBe(10);
  });
  test("the computer brings its marbles home instead of shuffling to a draw", () => {
    let state = createStar();
    // A fixed clock: the search always reaches its depth, so the game is the same every run.
    while (state.winner === null) state = starPlay(state, choose(starHop, state, 1e9, 2, () => 0)!)!;
    expect(state.winner).not.toBe("draw");
    expect(state.ply).toBeLessThan(300);
  });
  test("a marble left behind in its own point does not keep the other side from winning", () => {
    const state = createStar();
    // Side 0 has nine marbles home and one hole of the point is still held by side 1.
    state.cells.fill(null);
    const [squatter, last, ...rest] = [...HOME[1]].sort((a, b) => HOLES[b].r - HOLES[a].r);
    rest.forEach((i) => (state.cells[i] = 0));
    state.cells[squatter] = 1;
    const from = HOLES.findIndex((h, i) => state.cells[i] === null && i !== last && starMoves({ ...state, cells: state.cells.map((c, j) => (j === i ? 0 : c)) }).some((m) => m.from === i && m.to === last));
    state.cells[from] = 0;
    HOME[0].slice(0, 9).forEach((i) => (state.cells[i] = 1));
    expect(starPlay(state, { from, to: last, extra: -1 })!.winner).toBe(0);
  });
});
describe("ludo", () => {
  test("a turn begins with a roll, and the die is one to six", () => {
    const state = createLudo();
    expect(state.phase).toBe("roll");
    expect(ludoMoves(state).length).toBe(1);
    const rolled = ludoPlay(state, ludoMoves(state)[0], seeded(5))!;
    expect(rolled.die).toBeGreaterThanOrEqual(1);
    expect(rolled.die).toBeLessThanOrEqual(6);
  });
  test("a token leaves the yard only on a six", () => {
    for (let face = 1; face <= 6; face++) {
      const rolled = ludoPlay(createLudo(), ludoMoves(createLudo())[0], () => (face - 0.5) / 6)!;
      expect(rolled.die).toBe(face);
      if (face === 6) {
        expect(rolled.phase).toBe("move");
        expect(rolled.turn).toBe(0);
      } else expect(rolled.turn).toBe(1);
    }
  });
  test("a whole game comes to a winner with four tokens home", () => {
    const { state } = playOut(ludo, createLudo(), 4000, seeded(11));
    expect(state.winner).not.toBeNull();
  });
});
describe("pocket ball", () => {
  test("fifteen balls and the cue ball are racked, and nothing is assigned yet", () => {
    const state = createPool();
    expect(state.discs.length).toBe(16);
    expect(state.discs.every((d) => d.on)).toBe(true);
    expect(state.groups).toBeNull();
    expect(poolMoves(state).length).toBeGreaterThan(0);
  });
  test("a shot is deterministic and leaves the balls inside the table", () => {
    const state = createPool(),
      move = pool.choose!(state, "hard", seeded(2))!,
      a = pool.play(state, move)!,
      b = pool.play(state, move)!;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.discs.find((d) => d.id === CUE)!.on).toBe(true);
    for (const d of a.discs.filter((d) => d.on)) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(2.61);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(5.01);
    }
  });
  test("after the cue ball goes down the next player sets it where they like", () => {
    // The cue ball beside a corner pocket, struck straight into it.
    const start = createPool(),
      discs = start.discs.map((d) => (d.id === CUE ? { ...d, x: 1.9, z: 4.3 } : { ...d })),
      fouled = pool.play({ ...start, discs }, { from: CUE, to: 1000 + 45 * 32 + 8, extra: -1 })!;
    expect([fouled.foul, fouled.turn, fouled.hand, fouled.placed]).toEqual([true, 1, true, false]);
    expect(fouled.discs[CUE].on).toBe(true);
    expect([fouled.discs[CUE].x, fouled.discs[CUE].z]).toEqual([HEAD.x, HEAD.z]);
    // Anywhere free on the cloth will do, as often as wished; the turn stays.
    const spot = spotFor(fouled, -1.2, 0.5)!,
      placed = pool.play(fouled, { from: CUE, to: placeCode(spot.x, spot.z), extra: -1 })!;
    expect([placed.turn, placed.hand, placed.placed, placed.ply]).toEqual([1, true, true, fouled.ply]);
    expect(placed.discs[CUE].x).toBeCloseTo(-1.2, 5);
    expect(placed.discs[CUE].z).toBeCloseTo(0.5, 5);
    expect(placeOf(placeCode(spot.x, spot.z))!.x).toBeCloseTo(spot.x, 9);
    const again = pool.play(placed, { from: CUE, to: placeCode(1, -1), extra: -1 })!;
    expect(again.discs[CUE].x).toBeCloseTo(1, 5);
    // Not on another ball, not in a pocket, not off the cloth; and near a ball the nearest free place is offered.
    const eight = fouled.discs[8];
    expect(pool.play(fouled, { from: CUE, to: placeCode(eight.x, eight.z), extra: -1 })).toBeNull();
    expect(pool.play(fouled, { from: CUE, to: placeCode(2.54, 4.94), extra: -1 })).toBeNull();
    const near = spotFor(fouled, eight.x, eight.z)!;
    expect(free(fouled.discs, near.x, near.z)).toBe(true);
    // Without the foul nothing may be moved by hand.
    expect(pool.play(start, { from: CUE, to: placeCode(0, 0), extra: -1 })).toBeNull();
    // The shot that follows ends the hand; the computer sets the ball down before it shoots.
    const set = pool.choose!(fouled, "hard", seeded(3))!;
    expect(set.to).toBeGreaterThanOrEqual(1_000_000);
    const ready = pool.play(fouled, set)!,
      shot = pool.choose!(ready, "hard", seeded(3))!;
    expect(shot.to).toBeLessThan(1_000_000);
    const after = pool.play(ready, shot)!;
    expect(after.placed).toBe(false);
    expect(after.hand).toBe(after.foul);
  });
  test("two computers can play shots in turn", () => {
    const { plies } = playOut(pool, createPool(), 12, seeded(9));
    expect(plies).toBeGreaterThan(0);
  });
});
describe("indian poker", () => {
  test("a bet is set up and down without a chip moving, and made with one press", () => {
    const to = (point: number) => ({ from: -1, to: point, extra: -1 });
    let state = indian.play(createIndian(seeded(5)), to(READY))!;
    const start = state;
    expect(state.turn).toBe(0);
    expect(indian.moves(state).some((m) => m.to === DOWN)).toBe(false);
    for (let i = 0; i < 5; i++) state = indian.play(state, to(UP))!;
    state = indian.play(state, to(DOWN))!;
    // Nothing has been put in and the turn has not passed.
    expect([state.wager, state.ply, state.turn, pot(state), state.chips[0]]).toEqual([4, start.ply, 0, pot(start), start.chips[0]]);
    expect(indian.hint(state)).toMatch(/내 베팅 4/);
    state = indian.play(state, to(DECIDE))!;
    expect([state.wager, state.ply, state.turn, pot(state), state.chips[0]]).toEqual([0, start.ply + 1, 1, pot(start) + 4, start.chips[0] - 4]);
    // It cannot go above what both can cover.
    let high = start;
    while (indian.moves(high).some((m) => m.to === UP)) high = indian.play(high, to(UP))!;
    expect(high.wager).toBe(most(start));
    expect(indian.play(high, to(UP))).toBeNull();
    // Made without a raise, it is a check: the word passes.
    const checked = indian.play(start, to(DECIDE))!;
    expect([checked.checked, checked.turn, pot(checked)]).toEqual([true, 1, pot(start)]);
  });
  test("the chips on the table and in hand always add up", () => {
    const random = seeded(4);
    let state = createIndian(random);
    expect(state.chips[0] + state.chips[1] + pot(state)).toBe(START_CHIPS * 2);
    for (let i = 0; i < 400 && indian.winner(state) === null; i++) {
      const legal = indian.moves(state),
        pick = (state.turn === 1 && state.phase === "bet" ? indian.choose!(state, "normal", random) : null) ?? legal[Math.floor(random() * legal.length)];
      state = indian.play(state, pick, random)!;
      expect(state).not.toBeNull();
      expect(state.chips[0] + state.chips[1] + pot(state)).toBe(START_CHIPS * 2);
    }
  });
  test("a game is one pack of ten rounds when both only ever check", () => {
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed);
      let state = createIndian(random),
        rounds = 1;
      while (indian.winner(state) === null) {
        const legal = indian.moves(state),
          before = state.round,
          pick = legal.find((m) => m.to === NEXT) ?? legal.find((m) => m.to === READY) ?? legal.find((m) => m.to === (state.turn === 0 ? DECIDE : CALL))!;
        state = indian.play(state, pick, random)!;
        if (state.round !== before) rounds++;
        expect(state.chips[0] + state.chips[1] + pot(state)).toBe(START_CHIPS * 2);
      }
      expect(rounds).toBe(ROUNDS);
      expect(state.deck.length).toBe(0);
    }
  });
  test("whoever has no chip left to bet is bankrupt, and the game ends there", () => {
    let ended = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const random = seeded(seed);
      let state = createIndian(random);
      // I bet all I can and the computer calls everything.
      while (indian.winner(state) === null) {
        const legal = indian.moves(state),
          pick = legal.find((m) => m.to === NEXT) ?? (state.turn === 0 ? (legal.find((m) => m.to === UP) ?? legal.find((m) => m.to === DECIDE) ?? legal[0]) : legal.find((m) => m.to === CALL)!);
        state = indian.play(state, pick, random)!;
        expect(state.chips[0]).toBeGreaterThanOrEqual(0);
        expect(state.chips[1]).toBeGreaterThanOrEqual(0);
        expect(state.chips[0] + state.chips[1] + pot(state)).toBe(START_CHIPS * 2);
        // Out of chips after a tie is not out of the game: the pot still lies on the table.
        if (state.winner === null && state.phase === "show" && (state.chips[0] === 0 || state.chips[1] === 0)) expect(state.carry).toBeGreaterThan(0);
      }
      if (state.deck.length >= 2) {
        ended++;
        const broke = state.chips[0] === 0 ? 0 : 1;
        expect(state.chips[broke]).toBe(0);
        expect(state.winner).toBe(broke ? 0 : 1);
        expect(state.phase).toBe("show");
        expect(indian.moves(state)).toEqual([]);
        expect(indian.reason!(state)).toMatch(/칩이 모두 떨어졌습니다/);
      }
    }
    expect(ended).toBeGreaterThan(0);
  });
  test("a round begins with the cards raised, and a fold is remembered until the next deal", () => {
    let state = createIndian(seeded(5));
    expect(state.phase).toBe("ready");
    expect(indian.moves(state).map((m) => m.to)).toEqual([READY]);
    // Nothing of the other card is told before the cards are up.
    expect(indian.hint(state)).not.toMatch(/상대 카드는/);
    state = indian.play(state, { from: -1, to: READY, extra: -1 })!;
    expect([state.phase, state.turn, state.folded]).toEqual(["bet", state.first, null]);
    expect(indian.hint(state)).toMatch(/상대 카드는/);
    // I raise, the computer folds.
    state = indian.play(state, indian.moves(state).find((m) => m.to !== CALL && m.to !== FOLD && m.to < READY)!)!;
    state = indian.play(state, { from: -1, to: FOLD, extra: -1 })!;
    expect([state.phase, state.folded]).toEqual(["show", 1]);
    state = indian.play(state, { from: -1, to: NEXT, extra: -1 })!;
    expect([state.phase, state.folded]).toEqual(["ready", null]);
  });
  test("the computer decides the same whatever its own card is", () => {
    // The cards are raised first; then it is the computer that weighs a bet.
    const state = indian.play(createIndian(seeded(8)), { from: -1, to: READY, extra: -1 })!,
      waiting = { ...state, turn: 1 as const },
      other = { ...waiting, cards: [waiting.cards[0], waiting.cards[1] === 10 ? 1 : 10] as [number, number] };
    expect(indian.choose!(waiting, "hard", seeded(1))).toEqual(indian.choose!(other, "hard", seeded(1)));
  });
});
describe("table soccer", () => {
  test("each side has eleven figures on four rods", () => {
    for (const side of [0, 1]) {
      const mine = RODS.filter((r) => r.side === side);
      expect(mine.map((r) => r.figures.length).sort()).toEqual([1, 2, 3, 5]);
    }
  });
  test("my rods go as far as my hand at once, each stopping at its own end", () => {
    const world = createWorld(0);
    step(world, [{ target: 0.5, kick: false }, { target: 0, kick: false }]);
    expect(world.slide[0]).toBe(0.5);
    step(world, [{ target: MAX_SLIDE, kick: false }, { target: 0, kick: false }]);
    for (const rod of RODS.filter((r) => r.side === 0)) expect(offset(rod, world.slide[0])).toBe(rod.travel);
    // The computer's hand takes its time.
    step(world, [{ target: 0, kick: false }, { target: 1, kick: false, pace: 1 }]);
    expect(world.slide[1]).toBeLessThan(0.1);
  });
  test("a goal is a move, and the fifth one wins", () => {
    let state = createFoosball();
    expect(goalMoves(state).length).toBe(2);
    expect(goal(state, { from: -1, to: 2, extra: -1 })).toBeNull();
    for (let i = 0; i < GOALS; i++) state = goal(state, { from: -1, to: 1, extra: -1 })!;
    expect(state.score).toEqual([0, GOALS]);
    expect(foosball.winner(state)).toBe(1);
    expect(goal(state, { from: -1, to: 0, extra: -1 })).toBeNull();
  });
  test("a swing draws the foot back, then drives it forward", () => {
    expect(foot(-1).reach).toBe(0);
    expect(foot(SWING * 0.2).reach).toBeLessThan(0);
    expect(foot(SWING * 0.55).reach).toBeGreaterThan(0.3);
  });
  test("a ball rolling at an open goal scores for the side attacking it", () => {
    const world = createWorld(0);
    world.ball = { x: 0.6, z: -4.6, vx: 0, vz: -4 };
    let scorer: 0 | 1 | null = null;
    for (let i = 0; i < 240 && scorer === null; i++) scorer = step(world, [{ target: 0, kick: false }, { target: -1, kick: false }]);
    expect(scorer).toBe(0);
  });
  test("the ball stays on the table and the same seed plays the same match", () => {
    const run = () => {
      const random = seeded(7);
      let world = createWorld(0, 0.2);
      const score = [0, 0];
      for (let i = 0; i < 120 * 240; i++) {
        const scorer = step(world, [steer(world, 0, "hard", random), steer(world, 1, "easy", random)]);
        expect(Math.abs(world.ball.x)).toBeLessThanOrEqual(HALF_X);
        expect(Math.abs(world.ball.z)).toBeLessThanOrEqual(HALF_Z + BALL_R * 2.5);
        if (scorer !== null) {
          score[scorer]++;
          world = createWorld(scorer === 0 ? 1 : 0, random() - 0.5);
        }
      }
      return score;
    };
    const first = run();
    expect(run()).toEqual(first);
    // The surer hand wins.
    expect(first[0]).toBeGreaterThan(first[1]);
  });
});
