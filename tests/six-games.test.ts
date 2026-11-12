import { describe, expect, it } from "vitest";
import * as Q from "../src/games/wallrace/rules";
import * as D from "../src/games/domino/rules";
import * as N from "../src/games/hitblow/rules";
import * as A from "../src/games/alkkagi/rules";
import * as C from "../src/games/carrom/rules";
import * as R from "../src/games/tilerummy/rules";
import * as P from "../src/games/flick/physics";
import { choose } from "../src/games/points/ai";
import type { Move } from "../src/games/points/types";
import { seededRandom } from "../src/core/ai";
import { shownGuide } from "../src/ui/guide";

const to = (point: number): Move => ({ from: -1, to: point, extra: -1 });
const frozen = (s: unknown) => JSON.stringify(s);
const still = () => 0;

describe("Guide", () => {
  it("leaves out the sections on controls and closing remarks", () => {
    const html = "<h3>기본 규칙</h3><ol><li>a</li></ol><h3>조작</h3><p>b</p><h3>버튼</h3><p>c</p><h3>그 밖에</h3><p>d</p><h3>조작과 버튼</h3><p>e</p>";
    expect(shownGuide(html)).toBe("<h3>기본 규칙</h3><ol><li>a</li></ol><h3>버튼</h3><p>c</p>");
    expect(shownGuide("<p>plain</p>")).toBe("<p>plain</p>");
  });
});

describe("Wall race", () => {
  it("steps a pawn one square, and reaching the far row wins", () => {
    let s = Q.createGame();
    expect([s.pawns, Q.distance(s, 0), Q.distance(s, 1)]).toEqual([[76, 4], 8, 8]);
    expect(Q.steps(s, 0).sort((a, b) => a - b)).toEqual([67, 75, 77]);
    s = Q.play(s, to(67))!;
    expect([s.pawns[0], s.turn]).toEqual([67, 1]);
    expect(Q.play(s, to(80))).toBeNull();
    const near: Q.State = { ...Q.createGame(), pawns: [13, 40] };
    expect(Q.play(near, to(4))!.winner).toBe(0);
  });
  it("sets walls two squares long that stop a step, never crossing or shutting a pawn in", () => {
    let s = Q.createGame();
    // Across, above the red pawn's square and the one to its right: crossing row 7, column 4.
    s = Q.play(s, to(Q.H_BASE + 7 * 8 + 4))!;
    expect([s.left, Q.open(s, 76, -1, 0), Q.open(s, 77, -1, 0), Q.open(s, 75, -1, 0)]).toEqual([[9, 10], false, false, true]);
    expect(Q.steps({ ...s, turn: 0 }, 0).sort((a, b) => a - b)).toEqual([75, 77]);
    // Nothing may stand on that crossing again, nor overlap the wall beside it.
    expect(Q.play(s, to(Q.V_BASE + 7 * 8 + 4))).toBeNull();
    expect(Q.play(s, to(Q.H_BASE + 7 * 8 + 5))).toBeNull();
    expect(Q.play(s, to(Q.H_BASE + 7 * 8 + 6))).not.toBeNull();
    // A row of walls across the board with one gap; closing the gap would shut both pawns off.
    let fence = Q.createGame();
    for (const col of [0, 2, 4]) fence = { ...Q.play({ ...fence, turn: 0 }, to(Q.H_BASE + 3 * 8 + col))! };
    expect(Q.play({ ...fence, turn: 0 }, to(Q.H_BASE + 3 * 8 + 6))).not.toBeNull();
    const tight = Q.play({ ...fence, turn: 0 }, to(Q.H_BASE + 3 * 8 + 6))!;
    // Only the last column is open now: a wall there may not be set.
    expect(Q.distance(tight, 0)).toBeGreaterThan(8);
    expect(Q.play({ ...tight, turn: 0 }, to(Q.V_BASE + 3 * 8 + 7))).not.toBeNull();
    expect(Q.moves({ ...tight, turn: 0 }).every((m) => Q.distance(Q.play({ ...tight, turn: 0 }, m)!, 1) < Infinity)).toBe(true);
  });
  it("jumps the other pawn, or steps beside it when a wall stands behind", () => {
    const face: Q.State = { ...Q.createGame(), pawns: [40, 31] };
    expect(Q.steps(face, 0)).toContain(22);
    const walled = { ...face, h: face.h.map((_, i) => i === 2 * 8 + 4) };
    expect(Q.steps(walled, 0)).not.toContain(22);
    expect(Q.steps(walled, 0)).toEqual(expect.arrayContaining([30, 32]));
  });
  it("the computer walks on when nothing is in the way, and never changes its input", () => {
    const s = Q.createGame(),
      before = frozen(s),
      move = choose(Q.wallRace, s, 0, 1, still)!;
    expect(frozen(s)).toBe(before);
    expect(Q.play(s, move)).not.toBeNull();
    const last: Q.State = { ...Q.createGame(), pawns: [13, 40], left: [0, 0] };
    expect(choose(Q.wallRace, last, 0, 2, still)).toEqual(to(4));
  });
});

describe("Dominoes", () => {
  it("deals seven each from the 28 tiles and lays a tile where a half matches an end", () => {
    let s = D.createGame(seededRandom(3));
    expect([D.TILES.length, s.hands[0].length, s.hands[1].length, s.stock.length]).toEqual([28, 7, 7, 14]);
    expect(new Set([...s.hands[0], ...s.hands[1], ...s.stock]).size).toBe(28);
    const first = s.hands[0][0];
    s = D.play(s, { from: first, to: D.RIGHT, extra: -1 })!;
    expect([s.line.length, s.turn, D.ends(s)]).toEqual([1, 1, D.TILES[first]]);
    const fitted: D.State = { ...s, hands: [[], [D.TILES.findIndex(([a, b]) => a === D.TILES[first][1] && b !== a && D.TILES.indexOf(D.TILES[first]) !== -1) ]], stock: [] };
    const tile = fitted.hands[1][0];
    if (tile >= 0 && tile !== first) {
      const next = D.play(fitted, { from: tile, to: D.RIGHT, extra: -1 })!;
      // The matching half faces the line.
      expect(next.line[1].left).toBe(D.TILES[first][1]);
      expect(next.winner).toBe(1);
    }
  });
  it("draws while nothing fits, passes on an empty pile, and counts pips when both are stuck", () => {
    const six = D.TILES.findIndex(([a, b]) => a === 6 && b === 6),
      blank = D.TILES.findIndex(([a, b]) => a === 0 && b === 0),
      one = D.TILES.findIndex(([a, b]) => a === 1 && b === 1),
      two = D.TILES.findIndex(([a, b]) => a === 2 && b === 2),
      base: D.State = { ...D.createGame(seededRandom(1)), hands: [[blank], [one]], stock: [two], line: [{ tile: six, left: 6, right: 6 }], turn: 0 };
    expect(D.moves(base)).toEqual([to(D.DRAW)]);
    let s = D.play(base, to(D.DRAW))!;
    expect([s.hands[0], s.stock, s.turn]).toEqual([[blank, two], [], 0]);
    expect(D.moves(s)).toEqual([to(D.PASS)]);
    s = D.play(s, to(D.PASS))!;
    s = D.play(s, to(D.PASS))!;
    // Two pips against four.
    expect([s.winner, D.pips(s.hands[1]), D.pips(s.hands[0])]).toEqual([1, 2, 4]);
  });
  it("the computer plays to the end without seeing my hand", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = seededRandom(seed * 7);
      let s = D.createGame(seededRandom(seed)),
        steps = 0;
      while (s.winner === null) {
        const before = frozen(s),
          move = D.chooseTile(s, seed % 3 === 0 ? "easy" : seed % 3 === 1 ? "normal" : "hard", random)!;
        expect(frozen(s)).toBe(before);
        s = D.play(s, move)!;
        expect(++steps).toBeLessThan(200);
      }
      expect(s.line.every((laid, i) => i === 0 || s.line[i - 1].right === laid.left)).toBe(true);
    }
  });
});

describe("Number baseball", () => {
  it("counts strikes and balls", () => {
    expect(N.judge([1, 2, 3], [1, 3, 5])).toEqual({ strikes: 1, balls: 1 });
    expect(N.judge([1, 2, 3], [4, 5, 6])).toEqual({ strikes: 0, balls: 0 });
    expect(N.judge([1, 2, 3], [3, 1, 2])).toEqual({ strikes: 0, balls: 3 });
    expect([N.allNumbers(3).length, N.allNumbers(4).length]).toEqual([720, 5040]);
  });
  it("with repeats allowed, digits out of place are matched one for one", () => {
    expect(N.judge([1, 1, 2], [3, 1, 1])).toEqual({ strikes: 1, balls: 1 });
    expect(N.judge([1, 1, 2], [1, 1, 1])).toEqual({ strikes: 2, balls: 0 });
    expect(N.judge([1, 2, 2], [2, 1, 1])).toEqual({ strikes: 0, balls: 2 });
    expect(N.judge([5, 5, 5, 5], [5, 5, 5, 5])).toEqual({ strikes: 4, balls: 0 });
    expect([N.allNumbers(3, true).length, N.allNumbers(4, true).length]).toEqual([1000, 10000]);
    let s = N.createGame(3, seededRandom(2), true);
    for (const d of [7, 7, 7, N.ENTER]) s = N.play(s, to(d))!;
    expect([s.repeat, s.secrets[0], s.phase]).toEqual([true, [7, 7, 7], "play"]);
    // The computer still finds it from the answers alone.
    let turn: N.State = { ...s, turn: 1, guesses: [[{ digits: [0, 0, 0], strikes: 0, balls: 0 }], []] },
      throws = 0;
    const random = seededRandom(3);
    for (;;) {
      turn = N.play(turn, N.chooseGuess(turn, "hard", random)!)!;
      throws++;
      if (turn.guesses[1][turn.guesses[1].length - 1].strikes === 3) break;
      turn = { ...turn, turn: 1, guesses: [[...turn.guesses[0], { digits: [0, 0, 0], strikes: 0, balls: 0 }], turn.guesses[1]] };
      expect(throws).toBeLessThan(20);
    }
    expect(N.hitBlow.create("4d").repeat).toBe(true);
    expect(N.hitBlow.create("4").size).toBe(4);
  });
  it("takes my number, then guesses in turn; both guess the same number of times", () => {
    let s = N.createGame(3, seededRandom(4));
    const key = (...digits: number[]) => {
      for (const d of digits) s = N.play(s, to(d))!;
    };
    expect([s.phase, N.play(s, to(N.ENTER))]).toEqual(["secret", null]);
    key(1, 2);
    expect(N.play(s, to(2))).toBeNull();
    key(N.BACK, 2, 3, N.ENTER);
    expect([s.phase, s.secrets[0], s.entry, s.turn]).toEqual(["play", [1, 2, 3], [], 0]);
    // I find the computer's number at once; it still has its throw of the round.
    key(...s.secrets[1], N.ENTER);
    expect([s.turn, s.winner, s.guesses[0][0].strikes]).toEqual([1, null, 3]);
    const miss = N.play(s, to(N.GUESS_BASE + 456))!;
    expect([miss.winner, miss.guesses[1][0]]).toEqual([0, { digits: [4, 5, 6], strikes: 0, balls: 0 }]);
    expect(N.play(s, to(N.GUESS_BASE + 123))!.winner).toBe("draw");
    // A leading zero is read back.
    expect(N.play(s, to(N.GUESS_BASE + 12))!.guesses[1][0].digits).toEqual([0, 1, 2]);
  });
  it("the computer finds a number from the answers alone", () => {
    for (const [level, limit] of [["normal", 9], ["hard", 8]] as const)
      for (let seed = 1; seed <= 10; seed++) {
        const random = seededRandom(seed);
        let s: N.State = { ...N.createGame(3, seededRandom(seed + 50)), phase: "play", secrets: [[(seed * 3) % 10, (seed * 3 + 1) % 10, (seed * 3 + 5) % 10], [7, 8, 9]], turn: 1, guesses: [[{ digits: [0, 1, 2], strikes: 0, balls: 0 }], []] },
          throws = 0;
        for (;;) {
          const move = N.chooseGuess(s, level, random)!;
          s = N.play(s, move)!;
          throws++;
          if (s.guesses[1][s.guesses[1].length - 1].strikes === 3) break;
          s = { ...s, turn: 1, guesses: [[...s.guesses[0], { digits: [0, 1, 2], strikes: 0, balls: 0 }], s.guesses[1]] };
          expect(throws).toBeLessThan(15);
        }
        expect(throws).toBeLessThanOrEqual(limit);
      }
  });
});

describe("Flick physics", () => {
  const arena: P.Arena = { halfX: 5, halfZ: 5, cushions: false, pockets: [], friction: 7, bounce: 0.9 };
  const disc = (id: number, x: number, z: number): P.Disc => ({ id, x, z, vx: 0, vz: 0, r: 0.24, m: 1, on: true });
  it("a disc slows to rest; a square hit hands its speed on; the same shot ends the same way", () => {
    const one = [disc(0, 0, 0)];
    P.strike(one[0], 0, 5);
    P.settle(one, arena);
    // v² / 2μ = 25 / 14.
    expect(one[0].x).toBeCloseTo(25 / 14, 1);
    const run = () => {
      const pair = [disc(0, -2, 0), disc(1, 0, 0)];
      P.strike(pair[0], 0, 8);
      return { ...P.settle(pair, arena), pair };
    };
    const a = run(),
      b = run();
    expect(a.pair[0].x).toBeLessThan(0.2);
    expect(a.pair[1].x).toBeGreaterThan(1);
    expect(frozen(a.pair)).toBe(frozen(b.pair));
  });
  it("falls off an open edge, bounces off a cushion and a post, and drops into a pocket", () => {
    const off = [disc(0, 4, 0)];
    P.strike(off[0], 0, 10);
    expect([P.settle(off, arena).gone, off[0].on]).toEqual([[0], false]);
    const walled = [disc(0, 4, 0)];
    P.strike(walled[0], 0, 10);
    expect([P.settle(walled, { ...arena, cushions: true }).gone, walled[0].x < 4.76]).toEqual([[], true]);
    const stopped = [disc(0, -2, 0)];
    P.strike(stopped[0], 0, 8);
    P.settle(stopped, { ...arena, posts: [{ x: 0, z: 0, r: 0.2 }] });
    expect(stopped[0].x).toBeLessThan(-0.4);
    const sunk = [disc(0, 0, 0)];
    P.strike(sunk[0], Math.PI / 4, 12);
    expect(P.settle(sunk, { ...arena, cushions: true, pockets: [{ x: 4.6, z: 4.6, r: 0.5 }] }).gone).toEqual([0]);
    expect([P.shotOf(P.shotCode(-90, 7)), P.shotOf(P.shotCode(725, 99))?.power, P.shotOf(5)]).toEqual([{ degrees: 270, power: 7, angle: (270 * Math.PI) / 180 }, 20, null]);
  });
});

describe("Alkkagi", () => {
  it("go stones: each side sets its stones on its own half, by hand or in a row, then side 0 flicks", () => {
    let s = A.createGame("go-3");
    expect([s.phase, s.toPlace, s.turn]).toEqual(["place", [3, 3], 0]);
    // The middle line and the far half are closed to side 0.
    expect(A.play(s, to(9 * 19 + 9))).toBeNull();
    expect(A.play(s, to(5 * 19 + 9))).toBeNull();
    s = A.play(s, to(13 * 19 + 9))!;
    expect([s.discs.length, s.discs[0].x, s.discs[0].z, s.toPlace, s.turn]).toEqual([1, 0, 2, [2, 3], 0]);
    expect(A.play(s, to(13 * 19 + 9))).toBeNull();
    s = A.play(s, to(A.LAY_ROW))!;
    expect([s.discs.length, s.turn, s.phase]).toEqual([3, 1, "place"]);
    // The computer sets its own, one at a time, on its half.
    const random = seededRandom(2);
    while (s.phase === "place") s = A.play(s, A.chooseShot(s, "normal", random)!)!;
    expect([s.discs.length, s.turn, s.discs.slice(3).every((d) => d.z < 0)]).toEqual([6, 0, true]);
    expect(new Set(s.discs.map((d) => `${d.x},${d.z}`)).size).toBe(6);
  });
  it("janggi pieces stand where a game of janggi begins, sixteen a side, in three sizes", () => {
    const s = A.createGame("janggi");
    expect([s.phase, s.discs.length, s.owners.filter((o) => o === 0).length]).toEqual(["play", 32, 16]);
    expect([s.labels[8], s.labels[24], s.labels[11], s.labels[27]]).toEqual(["楚", "漢", "卒", "兵"]);
    // Cho's general: the middle file, one rank up from its back row.
    expect([s.discs[8].x, s.discs[8].z, s.discs[8].r > s.discs[0].r, s.discs[0].r > s.discs[3].r]).toEqual([0, 3.5, true, true]);
    expect(A.arenaOf("janggi").posts).toHaveLength(6);
  });
  it("a flick knocks a stone off; losing every stone loses; the hinges stop a piece", () => {
    const disc = (id: number, x: number, z: number): P.Disc => ({ id, x, z, vx: 0, vz: 0, r: 0.235, m: 1, on: true });
    const s: A.State = { ...A.createGame("go-3"), phase: "play", toPlace: [0, 0], discs: [disc(0, 0, 2), disc(1, 0, -4.4)], owners: [0, 1], labels: ["", ""] };
    // Straight up the board (270°), hard enough to carry the far stone over the edge.
    const next = A.play(s, { from: 0, to: P.shotCode(270, 16), extra: -1 })!;
    expect([next.lost.includes(1), next.winner === 0 || next.winner === "draw", next.turn]).toEqual([true, true, 1]);
    expect(A.play(s, { from: 1, to: P.shotCode(90, 5), extra: -1 })).toBeNull();
    expect(A.play(s, { from: 0, to: 12, extra: -1 })).toBeNull();
    const j = A.createGame("janggi"),
      soldier = j.discs.findIndex((d, i) => j.labels[i] === "卒" && d.x === -2);
    // Slid sideways along the fold, a piece is stopped by the hinge at x = -2.5… it starts right of it and goes left.
    const piece: A.State = { ...j, discs: j.discs.map((d) => (d.id === soldier ? { ...d, x: -1, z: 0 } : d)) };
    const hit = A.play(piece, { from: soldier, to: P.shotCode(180, 8), extra: -1 })!;
    expect(hit.discs[soldier].x).toBeGreaterThan(-2.3);
    expect(hit.discs[soldier].on).toBe(true);
  });
  it("the computer shoots only its own stones and plays a game out", () => {
    const random = seededRandom(5);
    let s = A.createGame("go-5");
    s = A.play(s, to(A.LAY_ROW))!;
    while (s.phase === "place") s = A.play(s, A.chooseShot(s, "hard", random)!)!;
    let shots = 0;
    while (s.winner === null && shots < 80) {
      const before = frozen(s),
        move = A.chooseShot(s, shots % 2 ? "hard" : "easy", random)!;
      expect(frozen(s)).toBe(before);
      expect(s.owners[move.from]).toBe(s.turn);
      s = A.play(s, move)!;
      shots++;
    }
    expect(shots).toBeGreaterThan(1);
  });
});

describe("Carrom", () => {
  it("sets nine white, nine black and the queen round the middle without overlap", () => {
    const s = C.createGame();
    expect([s.discs.length, C.left(s, 0), C.left(s, 1), s.discs[C.QUEEN].x, s.discs[C.STRIKER].on]).toEqual([20, 9, 9, 0, false]);
    for (const a of s.discs.slice(0, 19)) for (const b of s.discs.slice(0, 19)) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.45);
  });
  it("shoots forward only from a clear slot; pocketing an own man keeps the turn", () => {
    const s = C.createGame();
    expect(C.play(s, { from: C.STRIKER, to: P.shotCode(90, 10), extra: 14 })).toBeNull();
    expect(C.play(s, { from: 0, to: P.shotCode(270, 10), extra: 14 })).toBeNull();
    const next = C.play(s, { from: C.STRIKER, to: P.shotCode(270, 14), extra: 14 })!;
    expect([next.ply, next.discs[C.STRIKER].on, next.last]).toEqual([1, false, { code: P.shotCode(270, 14), slot: 14, by: 0 }]);
    // A white man on the lip of the far left pocket, with the striker lined up behind it.
    const man: C.State = { ...s, discs: s.discs.map((d) => (d.id === 0 ? { ...d, x: -4.3, z: -4.3 } : d)) },
      angle = (Math.atan2(-4.3 - C.BASE, -4.3 - C.slotX(0)) * 180) / Math.PI,
      sunk = C.play(man, { from: C.STRIKER, to: P.shotCode(angle, 12), extra: 0 })!;
    expect(sunk.sunk).toContain(0);
    if (!sunk.foul) expect([sunk.turn, C.left(sunk, 0)]).toEqual([0, 8]);
  });
  it("a pocketed striker is a foul that brings a man back; the queen must be covered", () => {
    const s = C.createGame(),
      lone: C.State = { ...s, discs: s.discs.map((d) => (d.id === 0 ? { ...d, on: false } : d)) },
      // Straight into the far right pocket from the right end of the base line.
      angle = (Math.atan2(-4.68 - C.BASE, 4.68 - C.slotX(27)) * 180) / Math.PI,
      foul = C.play({ ...lone, discs: lone.discs.map((d) => (d.id < 19 && d.id !== 0 ? { ...d, x: -4 + (d.id % 6) * 0.6, z: 3 + Math.floor(d.id / 6) * 0.55 } : d)) }, { from: C.STRIKER, to: P.shotCode(angle, 14), extra: 27 })!;
    expect([foul.foul, foul.turn, foul.discs[0].on]).toEqual([true, 1, true]);
    // The queen down without a man of one's own: it waits for the next shot, and goes back if that fails.
    const waiting: C.State = { ...s, cover: 0, discs: s.discs.map((d) => (d.id === C.QUEEN ? { ...d, on: false } : d)) },
      missed = C.play(waiting, { from: C.STRIKER, to: P.shotCode(270, 3), extra: 0 })!;
    expect([missed.cover, missed.queen, missed.discs[C.QUEEN].on]).toEqual([null, null, true]);
  });
  it("the computer finds a legal shot and never changes its input", () => {
    const s = C.createGame(),
      before = frozen(s),
      move = C.chooseShot(s, "normal", seededRandom(3))!;
    expect(frozen(s)).toBe(before);
    expect(C.play(s, move)).not.toBeNull();
    expect(C.play({ ...s, turn: 1 }, C.chooseShot({ ...s, turn: 1 }, "hard", seededRandom(4))!)).not.toBeNull();
  });
});

describe("Tile rummy", () => {
  const tile = (colour: number, number: number, copy = 0) => colour * 26 + copy * 13 + number - 1;
  it("knows a set: one number in different colours, or a run of one colour, jokers standing in", () => {
    expect(R.worth([tile(0, 7), tile(1, 7), tile(3, 7)])).toBe(21);
    expect(R.worth([tile(0, 7), tile(1, 7), tile(1, 7, 1)])).toBe(0);
    expect(R.worth([tile(2, 4), tile(2, 5), tile(2, 6), tile(2, 7)])).toBe(22);
    expect(R.worth([tile(2, 4), tile(2, 6), tile(2, 7)])).toBe(0);
    expect(R.worth([tile(2, 4), R.JOKER, tile(2, 6)])).toBe(15);
    expect(R.worth([tile(2, 12), tile(2, 13), R.JOKER])).toBe(36);
    expect(R.worth([tile(2, 13), tile(2, 1), tile(2, 2)])).toBe(0);
    expect(R.worth([tile(0, 9), tile(1, 9)])).toBe(0);
    expect(R.worth([tile(0, 9), tile(1, 9), tile(2, 9), tile(3, 9), R.JOKER])).toBe(0);
    expect([R.colourOf(tile(3, 13, 1)), R.numberOf(tile(3, 13, 1)), R.isJoker(105)]).toEqual([3, 13, true]);
  });
  it("deals fourteen each; a first turn needs thirty of one's own tiles in good sets", () => {
    const dealt = R.createGame(seededRandom(6));
    expect([dealt.racks[0].length, dealt.racks[1].length, dealt.pool.length]).toEqual([14, 14, 78]);
    let s: R.State = { ...dealt, racks: [[tile(0, 10), tile(1, 10), tile(2, 10), tile(0, 2), tile(0, 3), tile(0, 4)], dealt.racks[1]], before: { table: [], rack: [tile(0, 10), tile(1, 10), tile(2, 10), tile(0, 2), tile(0, 3), tile(0, 4)] } };
    const move = (from: number, dest: number) => (s = R.play(s, { from, to: dest, extra: -1 })!);
    expect(R.moves(s).some((m) => m.to === R.DRAW)).toBe(true);
    // Nine points are not enough.
    move(tile(0, 2), R.NEW_SET);
    move(tile(0, 3), R.SET_BASE);
    move(tile(0, 4), R.SET_BASE);
    expect([s.table, R.trouble(s).includes("30점"), R.moves(s).some((m) => m.to === R.END), R.moves(s).some((m) => m.to === R.DRAW)]).toEqual([[[tile(0, 2), tile(0, 3), tile(0, 4)]], true, false, false]);
    move(tile(0, 10), R.NEW_SET);
    move(tile(1, 10), R.SET_BASE + 1);
    expect(R.trouble(s)).toContain("맞지 않는");
    // A tile of this turn may go back to the rack; the reset undoes everything.
    move(tile(1, 10), R.TO_RACK);
    expect(s.racks[0]).toContain(tile(1, 10));
    const reset = R.play(s, to(R.RESET))!;
    expect([reset.table, reset.racks[0].length]).toEqual([[], 6]);
    move(tile(1, 10), R.SET_BASE + 1);
    move(tile(2, 10), R.SET_BASE + 1);
    expect(R.trouble(s)).toBe("");
    const done = R.play(s, to(R.END))!;
    expect([done.winner, done.opened, done.turn, done.table.length]).toEqual([0, [true, false], 1, 2]);
  });
  it("after opening, sets on the table may be added to and taken apart, if all are good at the end", () => {
    const dealt = R.createGame(seededRandom(8)),
      run = [tile(1, 4), tile(1, 5), tile(1, 6), tile(1, 7)],
      rack = [tile(1, 8), tile(0, 7), tile(2, 7), tile(3, 1)];
    let s: R.State = { ...dealt, racks: [rack, dealt.racks[1]], table: [run], before: { table: [run], rack }, opened: [true, true] };
    const move = (from: number, dest: number) => (s = R.play(s, { from, to: dest, extra: -1 })!);
    // Not opened, a tile of the table could not be touched.
    expect(R.moves({ ...s, opened: [false, true] }).some((m) => m.from === tile(1, 7))).toBe(false);
    move(tile(1, 8), R.SET_BASE);
    // The 7 leaves the run for a set of sevens; the run 4-5-6 and 8 alone are no longer good.
    move(tile(1, 7), R.NEW_SET);
    move(tile(0, 7), R.SET_BASE + 1);
    move(tile(2, 7), R.SET_BASE + 1);
    expect(R.trouble(s)).toContain("맞지 않는");
    move(tile(1, 8), R.TO_RACK);
    expect(R.trouble(s)).toBe("");
    const next = R.play(s, to(R.END))!;
    expect([next.turn, next.table.map((set) => set.length), next.racks[0]]).toEqual([1, [3, 3], [tile(3, 1), tile(1, 8)]]);
  });
  it("drawing ends the turn; the computer lays what its rack holds and games come to an end", () => {
    const s = R.createGame(seededRandom(9)),
      drew = R.play(s, to(R.DRAW))!;
    expect([drew.racks[0].length, drew.pool.length, drew.turn]).toEqual([15, 77, 1]);
    const rich: R.State = { ...s, turn: 1, racks: [s.racks[0], [tile(0, 11), tile(1, 11), tile(2, 11), tile(3, 5)]], before: { table: [], rack: [tile(0, 11), tile(1, 11), tile(2, 11), tile(3, 5)] } };
    let step = R.play(rich, R.chooseStep(rich, "normal", still)!)!;
    expect(step.table).toEqual([[tile(0, 11), tile(1, 11), tile(2, 11)]]);
    step = R.play(step, R.chooseStep(step, "normal", still)!)!;
    expect([step.turn, step.opened[1], step.racks[1]]).toEqual([0, true, [tile(3, 5)]]);
    // Opened, it takes the table apart: its 5 and 8 fit only if the run 4–7 gives up its ends.
    const run = [tile(1, 4), tile(1, 5), tile(1, 6), tile(1, 7)],
      sixes = [tile(0, 6), tile(2, 6), tile(3, 6)],
      hand = [tile(1, 8), tile(1, 9), tile(0, 1)],
      table: R.State = { ...s, turn: 1, opened: [true, true], table: [run, sixes], racks: [s.racks[0], hand], before: { table: [run, sixes], rack: hand } };
    expect(R.partition([...run, ...sixes, tile(1, 8), tile(1, 9)])!.map((set) => set.length).sort()).toEqual([3, 6]);
    expect(R.partition([tile(0, 1), tile(0, 2)])).toBeNull();
    // Four of one number give one up to a run that needs it.
    const fours = [tile(0, 9), tile(1, 9), tile(2, 9), tile(3, 9)],
      need: R.State = { ...table, table: [fours], racks: [s.racks[0], [tile(3, 10), tile(3, 11)]], before: { table: [fours], rack: [tile(3, 10), tile(3, 11)] } },
      plan = R.rebuild(need)!;
    expect([plan.used.sort((a, b) => a - b), plan.table.map((set) => set.length).sort()]).toEqual([[tile(3, 10), tile(3, 11)], [3, 3]]);
    const before = JSON.stringify(need),
      built = R.play(need, R.chooseStep(need, "hard", still)!)!;
    expect(JSON.stringify(need)).toBe(before);
    expect([built.racks[1], built.table.every(R.valid), R.trouble(built)]).toEqual([[], true, ""]);
    expect(R.play(built, R.chooseStep(built, "hard", still)!)!.winner).toBe(1);
    // The easy level leaves the table alone; a person has no such move.
    expect(R.chooseStep(need, "easy", () => 0.9)).toEqual(to(R.DRAW));
    expect(R.moves({ ...need, turn: 0 }).some((m) => m.to === R.REBUILD)).toBe(false);
    expect(R.rebuild({ ...need, opened: [true, false] })).toBeNull();
    // Too little for an opening: it draws instead.
    const poor: R.State = { ...rich, racks: [s.racks[0], [tile(0, 1), tile(1, 1), tile(2, 1), tile(3, 5)]], before: { table: [], rack: [tile(0, 1), tile(1, 1), tile(2, 1), tile(3, 5)] } };
    expect(R.chooseStep(poor, "hard", still)).toEqual(to(R.DRAW));
    for (let seed = 1; seed <= 4; seed++) {
      const random = seededRandom(seed);
      let g = R.createGame(seededRandom(seed + 20)),
        steps = 0;
      while (g.winner === null) {
        const before = frozen(g),
          m = R.chooseStep(g, "hard", random)!;
        expect(frozen(g)).toBe(before);
        g = R.play(g, m)!;
        expect(++steps).toBeLessThan(3000);
      }
      expect(g.table.every((set) => R.valid(set))).toBe(true);
      expect(new Set([...g.racks[0], ...g.racks[1], ...g.pool, ...g.table.flat()]).size).toBe(106);
    }
  });
});
