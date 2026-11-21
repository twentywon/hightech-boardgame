import { describe, expect, test } from "vitest";
import type { Move } from "../src/games/points/types";
import { seededRandom } from "../src/core/ai";
import * as tracks from "../src/games/tracks/rules";
import { tracksConfig } from "../src/games/tracks/config";
import { CELL, cellAt, cellUnder, trainLine, tracksSubject } from "../src/games/tracks/layout";

const { N, E, S, W } = tracks;
type State = tracks.State;
/** A board of `size` with a railway along `path` (from a port on the left edge to one on the bottom edge), nothing given but the ports. */
function board(size: number, path: number[], give: number[] = []): State {
  const ports: [tracks.Port, tracks.Port] = [
      { cell: path[0], bit: W },
      { cell: path[path.length - 1], bit: S },
    ],
    answer = tracks.masksOf(size, path, ports),
    rows = new Array(size).fill(0),
    cols = new Array(size).fill(0);
  for (const cell of path) {
    rows[Math.floor(cell / size)]++;
    cols[cell % size]++;
  }
  const given = new Array(size * size).fill(0);
  for (const cell of [path[0], path[path.length - 1], ...give]) given[cell] = answer[cell];
  const links = new Array(size * size).fill(0);
  given.forEach((mask, cell) => {
    links[cell] |= mask;
    for (const bit of tracks.DIRS) {
      const other = mask & bit ? tracks.neighbour(size, cell, bit) : -1;
      if (other >= 0) links[other] |= tracks.opposite(bit);
    }
  });
  return { size, rows, cols, ports, given, links, marks: new Array(size * size).fill(false), answer, last: null, winner: null, ply: 0 };
}
/** Plays moves one after another; each must be legal. */
function playAll(state: State, moves: Move[]) {
  for (const move of moves) {
    const next = tracks.play(state, move);
    expect(next, JSON.stringify(move)).not.toBeNull();
    state = next!;
  }
  return state;
}
/** Every railway from the first port to the second, found by walking every self-avoiding way, counted when its numbers and given pieces agree. */
function brute(state: Pick<State, "size" | "rows" | "cols" | "ports" | "given">) {
  const { size, rows, cols, ports, given } = state,
    seen = new Uint8Array(size * size),
    path: number[] = [];
  let found = 0;
  const walk = (cell: number) => {
    seen[cell] = 1;
    path.push(cell);
    if (cell === ports[1].cell) {
      const masks = tracks.masksOf(size, path, ports),
        r = new Array(size).fill(0),
        c = new Array(size).fill(0);
      for (const k of path) {
        r[Math.floor(k / size)]++;
        c[k % size]++;
      }
      if (r.every((v, i) => v === rows[i]) && c.every((v, i) => v === cols[i]) && given.every((m, i) => !m || masks[i] === m)) found++;
    } else
      for (const bit of tracks.DIRS) {
        const next = tracks.neighbour(size, cell, bit);
        if (next >= 0 && !seen[next]) walk(next);
      }
    path.pop();
    seen[cell] = 0;
  };
  walk(ports[0].cell);
  return found;
}
// A 4×4 board: in at row 1 on the left, out at column 2 at the bottom.
//  . . . .
//  > a b .
//  . . c .
//  . . v .
const SMALL = [4, 5, 6, 10, 14];

describe("train tracks", () => {
  test("links are laid and lifted between cells side by side, and a tap marks a cell", () => {
    let state = board(4, SMALL);
    // The ports' links are given: 4 (west port, east to 5) and 14 (south port, north to 10).
    expect(state.links[4]).toBe(W | E);
    expect(state.links[5]).toBe(W);
    state = tracks.play(state, tracks.link(5, 6))!;
    expect(state.links[5]).toBe(W | E);
    expect(state.links[6]).toBe(W);
    expect(state.ply).toBe(1);
    // The same link again lifts it.
    const lifted = tracks.play(state, tracks.link(6, 5))!;
    expect(lifted.links[5]).toBe(W);
    expect(lifted.links[6]).toBe(0);
    // A tap marks an empty cell and takes the mark off again.
    const marked = tracks.play(state, { from: -1, to: 0, extra: -1 })!;
    expect(marked.marks[0]).toBe(true);
    expect(tracks.play(marked, { from: -1, to: 0, extra: -1 })!.marks[0]).toBe(false);
    // The input is never changed.
    expect(state.marks[0]).toBe(false);
  });
  test("refused: a third link, a marked cell, a given link lifted, a cell not beside, a mark on rails", () => {
    let state = board(4, SMALL);
    state = tracks.play(state, tracks.link(5, 6))!;
    // 5 has two links now: a third is refused.
    expect(tracks.play(state, tracks.link(5, 1))).toBeNull();
    expect(tracks.refusal(state, tracks.link(5, 1))).toContain("두 갈래");
    // A given piece's links stay.
    expect(tracks.play(state, tracks.link(4, 5))).toBeNull();
    expect(tracks.refusal(state, tracks.link(4, 5))).toContain("주어진");
    // Not side by side.
    expect(tracks.play(state, tracks.link(0, 5))).toBeNull();
    expect(tracks.play(state, tracks.link(3, 4))).toBeNull();
    // A marked cell takes no rail.
    const marked = tracks.play(state, { from: -1, to: 2, extra: -1 })!;
    expect(tracks.play(marked, tracks.link(6, 2))).toBeNull();
    expect(tracks.refusal(marked, tracks.link(6, 2))).toContain("X");
    // A cell with rails or a given piece cannot be marked.
    expect(tracks.play(state, { from: -1, to: 6, extra: -1 })).toBeNull();
    expect(tracks.refusal(state, { from: -1, to: 6, extra: -1 })).toContain("선로가 지나는");
    expect(tracks.play(state, { from: -1, to: 4, extra: -1 })).toBeNull();
    expect(tracks.moves(state).length).toBe(16);
  });
  test("a stroke lays each link in turn, passing over given rails, and is undone whole as one move", () => {
    const start = board(4, SMALL);
    // From the west port's cell through 5 (given link), 6, 10: one move.
    const move = tracks.stroke(4, 4, [5, 6, 10]);
    expect(move.to).toBe(tracks.STROKE);
    expect(tracks.strokeSteps(move.extra)).toEqual([E, E, S]);
    const state = tracks.play(start, move)!;
    expect(state.ply).toBe(1);
    expect(state.links[5]).toBe(W | E);
    expect(state.links[6]).toBe(W | S);
    expect(state.links[10]).toBe(N | S);
    expect(state.winner).toBe(0);
    // A stroke that lifts goes on lifting (on a board not yet solved: a solved one takes no more moves).
    expect(tracks.play(state, tracks.link(5, 6))).toBeNull();
    const part = tracks.play(start, tracks.stroke(4, 2, [6, 5]))!;
    expect(part.links[6]).toBe(N | W);
    // From 2 down to 6 and on over the given link 5–4: the first two are lifted, the given one passed over.
    const lifted = tracks.play(part, tracks.stroke(4, 2, [6, 5, 4]))!;
    expect(lifted.links[2]).toBe(0);
    expect(lifted.links[6]).toBe(0);
    expect(lifted.links[5]).toBe(W);
    expect(lifted.links[4]).toBe(W | E);
    // A stroke with a refused step is refused whole.
    const marked = tracks.play(start, { from: -1, to: 6, extra: -1 })!;
    expect(tracks.play(marked, tracks.stroke(4, 4, [5, 6, 10]))).toBeNull();
    // Only along given rails: nothing to do.
    expect(tracks.play(start, tracks.stroke(4, 4, [5]))).toBeNull();
    expect(tracks.drawn(start, 4, [5])).toBe(start);
    // Too long, or a step off the board.
    expect(tracks.play(start, { from: 4, to: tracks.STROKE, extra: 4 ** 30 })).toBeNull();
    expect(tracks.play(start, { from: 0, to: tracks.STROKE, extra: 1 * 4 + 0 })).toBeNull();
  });
  test("the win: numbers met and one railway from port to port, with no loop, branch, stray piece or loose end", () => {
    const start = board(4, SMALL);
    const solved = playAll(start, [tracks.link(5, 6), tracks.link(6, 10)]);
    expect(solved.winner).toBe(0);
    expect(tracks.solved(solved)).toBe(true);
    expect(tracks.play(solved, tracks.link(0, 1))).toBeNull();
    // A loose end: one link short.
    expect(playAll(start, [tracks.link(5, 6)]).winner).toBeNull();
    // A stray piece elsewhere: two cells joined to each other only (loose ends, and the numbers are wrong too).
    const stray = { ...solved, links: [...solved.links] };
    stray.links[0] = E;
    stray.links[1] = W;
    expect(tracks.solved(stray)).toBe(false);
    // A branch: three links on one cell.
    const branch = { ...solved, links: [...solved.links] };
    branch.links[6] = W | S | N;
    branch.links[2] = S;
    expect(tracks.solved(branch)).toBe(false);
    // A given piece that is not part of the railway (its links cannot be lifted, so it always stands apart).
    const apart = { ...solved, given: [...solved.given], links: [...solved.links] };
    apart.given[0] = E | S;
    apart.links[0] = E | S;
    apart.links[1] |= W;
    apart.links[4] |= N;
    expect(tracks.solved(apart)).toBe(false);
  });
  test("a closed loop beside a whole railway is no answer, even when the numbers allow it", () => {
    // 4×4: railway straight along row 3 from the left port to... a path in at row 3, out at column 3 at the bottom:
    // 12 13 14 15. A 2×2 ring at 0, 1, 5, 4 adds 2 to rows 0 and 1 and columns 0 and 1.
    const state = board(4, [12, 13, 14, 15]);
    const links = [...state.answer];
    links[0] = E | S;
    links[1] = W | S;
    links[5] = N | W;
    links[4] = N | E;
    const rows = [2, 2, 0, 4],
      cols = [3, 3, 1, 1];
    const looped = { ...state, rows, cols, links };
    expect(tracks.counts(looped).rows).toEqual(rows);
    expect(tracks.solved(looped)).toBe(false);
    // And the solver finds no answer with such numbers but the ring's: none with the ring, since a ring is never laid.
    expect(tracks.answers(4, rows, cols, state.ports, state.given, 5)).toEqual([]);
  });
  test("the solver agrees with walking every railway, on small boards with random numbers and given pieces", () => {
    const random = seededRandom(7);
    for (let k = 0; k < 160; k++) {
      const size = 3 + Math.floor(random() * 3),
        path = tracks.wander(size, Math.round(size * size * (0.3 + random() * 0.5)), random),
        give = path.filter(() => random() < 0.15),
        state = board(size, path, give);
      // Now and then numbers that no railway meets.
      if (k % 7 === 3) state.rows[0] = (state.rows[0] + 1) % (size + 1);
      const solver = tracks.answers(size, state.rows, state.cols, state.ports, state.given, 100000).length;
      expect(solver, `board ${k}`).toBe(brute(state));
      if (k % 7 !== 3) expect(solver).toBeGreaterThanOrEqual(1);
    }
  });
  test("every laid puzzle has one answer, starts unsolved with its ports given, and is laid quickly", () => {
    for (let stage = 1; stage <= tracks.STAGES.length; stage++) {
      let time = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const t = performance.now(),
          state = tracks.createGame(stage, seededRandom(seed * 41 + stage));
        time += performance.now() - t;
        const { size } = state,
          spec = tracks.STAGES[stage - 1];
        expect(size).toBe(spec.size);
        expect(tracks.solutions(size, state.rows, state.cols, state.ports, state.given, 3)).toBe(1);
        expect(tracks.answers(size, state.rows, state.cols, state.ports, state.given, 3)[0]).toEqual(state.answer);
        expect(tracks.solved({ ...state, links: state.answer })).toBe(true);
        expect(state.winner).toBeNull();
        expect(tracks.solved(state)).toBe(false);
        // The ports: one on the left edge facing out, one on the bottom edge.
        const sides = state.ports.map((p) => p.bit).sort();
        expect(sides).toEqual([S, W].sort());
        for (const p of state.ports) {
          expect(state.given[p.cell] & p.bit).toBeTruthy();
          expect(tracks.ends(state.given[p.cell])).toBe(2);
        }
        // The railway fills a fair share of the board.
        const passed = state.answer.filter(Boolean).length;
        expect(passed).toBeGreaterThanOrEqual(Math.floor(size * size * spec.share[0]) - 1);
        // Given pieces are pieces of the answer, and the board shows them.
        state.given.forEach((m, i) => {
          if (m) {
            expect(m).toBe(state.answer[i]);
            expect(state.links[i]).toBe(m);
          }
        });
      }
      // The browser lays a puzzle in well under a fifth of a second; here the whole stage's dozen must be quick.
      expect(time / 12).toBeLessThan(400);
    }
  });
  test("the hardest stage gives fewer pieces than the one before it", () => {
    let fourth = 0,
      fifth = 0;
    for (let seed = 1; seed <= 10; seed++) {
      fourth += tracks.createGame(4, seededRandom(seed)).given.filter(Boolean).length;
      fifth += tracks.createGame(5, seededRandom(seed)).given.filter(Boolean).length;
    }
    expect(fifth).toBeLessThan(fourth);
  });
  test("the hint reaches a win from scattered states: wrong rails, marks in the way, half a railway", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const random = seededRandom(seed * 13),
        stage = 1 + (seed % 4);
      let state = tracks.createGame(stage, random);
      const n = state.size * state.size;
      // Scatter: random links and marks where they are allowed.
      for (let k = 0; k < n; k++) {
        const cell = Math.floor(random() * n),
          bit = tracks.DIRS[Math.floor(random() * 4)],
          other = tracks.neighbour(state.size, cell, bit),
          move = random() < 0.3 ? { from: -1, to: cell, extra: -1 } : other >= 0 ? tracks.link(cell, other) : null;
        const next = move && tracks.play(state, move);
        if (next && next.winner === null) state = next;
      }
      for (let k = 0; k < 4 * n && state.winner === null; k++) {
        const move = tracks.hint(state);
        expect(move).not.toBeNull();
        const next = tracks.play(state, move!);
        expect(next, `seed ${seed} step ${k}`).not.toBeNull();
        state = next!;
      }
      expect(state.winner).toBe(0);
      expect(tracks.hint(state)).toBeNull();
    }
  });
  test("the train runs from outside the entrance through every cell of the railway to outside the exit", () => {
    const state = tracks.createGame(2, seededRandom(5)),
      solved = { ...state, links: state.answer },
      line = trainLine(state.size, solved.links, state.ports)!;
    expect(line).not.toBeNull();
    // Each step is short, and the line passes through the middle of every cell's sides on the way.
    for (let k = 1; k < line.length; k++) expect(Math.hypot(line[k].x - line[k - 1].x, line[k].z - line[k - 1].z)).toBeLessThan(0.08);
    const cells = new Set(line.map((p) => cellUnder(state.size, p.x, p.z)).filter((c) => c >= 0));
    expect([...cells].sort((a, b) => a - b)).toEqual(tracks.route(solved).cells.sort((a, b) => a - b));
    expect(trainLine(state.size, state.links, state.ports)).toBeNull();
  });
  test("layout: cells and the pointer agree, and the board fits the camera's subject", () => {
    for (const size of [5, 6, 8, 10]) {
      for (let i = 0; i < size * size; i++) {
        const p = cellAt(size, i);
        expect(cellUnder(size, p.x, p.z)).toBe(i);
        expect(cellUnder(size, p.x + CELL * 0.45, p.z, 0.4)).toBe(-1);
      }
      const subject = tracksSubject(size, 1.6);
      expect(subject.half).toBeGreaterThan((size * CELL) / 2);
    }
  });
  test("config: keys, stages and texts", () => {
    const state = tracks.createGame(1, seededRandom(3));
    expect(tracksConfig.stages).toHaveLength(5);
    expect(tracksConfig.stages!.every((s) => s.art.startsWith("<svg"))).toBe(true);
    // Shift with an arrow lays from the cursor's cell; without Shift the arrow only walks.
    expect(tracksConfig.keyMove!("ArrowRight", state, false, { shift: true, cursor: 0 })).toEqual(tracks.link(0, 1));
    expect(tracksConfig.keyMove!("ArrowUp", state, false, { shift: true, cursor: 0 })).toBeNull();
    expect(tracksConfig.keyMove!("ArrowRight", state, false, { shift: false, cursor: 0 })).toBeNull();
    expect(tracks.tracks.reason(state).startsWith("성공!")).toBe(true);
    expect(tracksConfig.rules).toContain("기본 규칙");
    expect(tracksConfig.rules).toContain("처음이라면");
    expect(tracksConfig.rules).not.toContain("조작");
  });
});
