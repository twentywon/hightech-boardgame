import { describe, expect, test } from "vitest";
import type { Move, PointGame } from "../src/games/points/types";
import { HOLES, HOME, starHop, createGame as createStar, moves as starMoves, play as starPlay } from "../src/games/starhop/rules";
import { ludo, createGame as createLudo, moves as ludoMoves, play as ludoPlay } from "../src/games/ludo/rules";
import { pool, createGame as createPool, moves as poolMoves, CUE } from "../src/games/pool/rules";
import { indian, createGame as createIndian, pot, START_CHIPS } from "../src/games/indian/rules";
import { foosball, createGame as createFoosball, play as goal, moves as goalMoves, GOALS } from "../src/games/foosball/rules";
import { BALL_R, HALF_X, HALF_Z, RODS, createWorld, foot, steer, step, SWING } from "../src/games/foosball/sim";

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
  test("two computers can play shots in turn", () => {
    const { plies } = playOut(pool, createPool(), 12, seeded(9));
    expect(plies).toBeGreaterThan(0);
  });
});
describe("indian poker", () => {
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
  test("the computer decides the same whatever its own card is", () => {
    const state = createIndian(seeded(8)),
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
