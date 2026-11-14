import { describe, expect, it } from "vitest";
import * as J from "../src/games/janggi/rules";
import { position, sq } from "./janggi-fixtures";

const targets = (s: J.State, from: number) =>
  J.legalMoves(s, from)
    .map((m) => m.to)
    .sort((a, b) => a - b);
const points = (...list: [number, number][]) => list.map(([f, r]) => sq(f, r)).sort((a, b) => a - b);
const frozen = (s: J.State) => JSON.stringify(s);

describe("Janggi setup", () => {
  it("places sixteen pieces a side with the kings in the palace centres", () => {
    const s = J.createGame();
    expect(s.board).toHaveLength(90);
    expect([...s.board].filter((p) => J.sideOf(p) === "cho")).toHaveLength(16);
    expect([...s.board].filter((p) => J.sideOf(p) === "han")).toHaveLength(16);
    expect(s.board[sq(5, 9)]).toBe("K");
    expect(s.board[sq(5, 2)]).toBe("k");
    expect(s.board.slice(81)).toBe("RNEA.ANER");
    // Han reads its formation from its own left, the ninth file.
    expect(s.board.slice(0, 9)).toBe("rena.aenr");
    expect(s.board[sq(2, 8)] + s.board[sq(8, 8)]).toBe("CC");
    expect([1, 3, 5, 7, 9].map((f) => s.board[sq(f, 7)]).join("")).toBe("PPPPP");
    expect(s.turn).toBe("cho");
    expect(J.points(s.board)).toEqual({ cho: 72, han: 73.5 });
  });
  it("arranges horses and elephants by formation, read from each player's left", () => {
    expect(J.createGame("ENEN").board.slice(81)).toBe("RENA.AENR");
    expect(J.createGame("NEEN").board.slice(81)).toBe("RNEA.AENR");
    expect(J.createGame("ENNE").board.slice(81)).toBe("RENA.ANER");
    // Han's left is the ninth file.
    expect(J.createGame("NENE", "ENEN").board.slice(0, 9)).toBe("rnea.aner");
  });
  it("gives Cho thirty-one opening moves", () => {
    const s = J.createGame();
    // Pawns 5 × 2–3, chariots 2 each, horses 1–2, elephants, cannons none, king and guards.
    expect(J.legalMoves(s).length).toBe(31);
    expect(J.legalMoves(s).every((m) => J.sideOf(s.board[m.from]) === "cho")).toBe(true);
  });
});

describe("Janggi pieces", () => {
  it("moves the king and guards along the palace lines only", () => {
    const s = position("K59 A49 k52");
    expect(targets(s, sq(5, 9))).toEqual(points([4, 8], [5, 8], [6, 8], [6, 9], [4, 10], [5, 10], [6, 10]));
    // A side point of the palace has no diagonal.
    const side = position("K58 A49 k42");
    expect(targets(side, sq(4, 9))).toEqual(points([4, 8], [4, 10], [5, 9]));
    const edge = position("K49 k62");
    expect(targets(edge, sq(4, 9))).toEqual(points([4, 8], [5, 9], [4, 10]));
  });
  it("slides the chariot until blocked, capturing only the enemy", () => {
    const s = position("K49 R15 P35 p12 k42");
    expect(targets(s, sq(1, 5))).toEqual(
      points([2, 5], [1, 4], [1, 3], [1, 2], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10]),
    );
  });
  it("lets the chariot and the pawn use the palace diagonals", () => {
    const s = position("K59 R41 k62 P53", "cho");
    expect(targets(s, sq(4, 1))).toContain(sq(5, 2));
    expect(targets(s, sq(4, 1))).toContain(sq(6, 3));
    const pawn = position("K59 P52 k41");
    expect(targets(pawn, sq(5, 2))).toEqual(points([4, 1], [5, 1], [6, 1], [4, 2], [6, 2]));
    const corner = position("K59 P43 k61");
    expect(targets(corner, sq(4, 3))).toEqual(points([4, 2], [3, 3], [5, 3], [5, 2]));
  });
  it("blocks the horse and the elephant on their way", () => {
    const open = position("K49 N55 k42");
    expect(targets(open, sq(5, 5))).toEqual(
      points([4, 3], [6, 3], [4, 7], [6, 7], [3, 4], [3, 6], [7, 4], [7, 6]),
    );
    const blocked = position("K49 N55 P54 p65 k42");
    expect(targets(blocked, sq(5, 5))).toEqual(points([4, 7], [6, 7], [3, 4], [3, 6]));
    const elephant = position("K49 E55 k42");
    expect(targets(elephant, sq(5, 5))).toEqual(
      points([3, 2], [7, 2], [3, 8], [7, 8], [2, 3], [2, 7], [8, 3], [8, 7]),
    );
    // A piece on the second point of the path also blocks.
    const far = position("K49 E55 p43 p34 k42");
    expect(targets(far, sq(5, 5))).not.toContain(sq(3, 2));
    expect(targets(far, sq(5, 5))).not.toContain(sq(2, 3));
  });
  it("makes the cannon jump exactly one piece that is not a cannon, and never take a cannon", () => {
    const s = position("K49 C15 P35 p75 k42");
    // Over the pawn on file 3: lands on 4–6 and takes the pawn on 7.
    expect(targets(s, sq(1, 5))).toEqual(points([4, 5], [5, 5], [6, 5], [7, 5]));
    const overCannon = position("K49 C15 c35 p75 k42");
    expect(targets(overCannon, sq(1, 5))).toEqual([]);
    const takesCannon = position("K49 C15 P35 c55 k42");
    expect(targets(takesCannon, sq(1, 5))).toEqual(points([4, 5]));
    const diagonal = position("K59 C41 a52 k43 p63");
    expect(targets(diagonal, sq(4, 1))).toContain(sq(6, 3));
  });
  it("moves pawns forward and sideways, never back", () => {
    const s = position("K49 P55 p53 k42");
    expect(targets(s, sq(5, 5))).toEqual(points([5, 4], [4, 5], [6, 5]));
    const han = position("K49 P55 p53 k42", "han");
    expect(targets(han, sq(5, 3))).toEqual(points([5, 4], [4, 3], [6, 3]));
  });
});

describe("Janggi rules of play", () => {
  it("forbids leaving the king attacked and requires answering a check", () => {
    // The guard is pinned on the file by the chariot.
    const pinned = position("K59 A58 r51 k42");
    expect(targets(pinned, sq(5, 8))).toEqual([]);
    const checked = position("K59 A49 r51 k42");
    expect(J.inCheck(checked)).toBe(true);
    expect(J.canPass(checked)).toBe(false);
    expect(J.play(checked, null)).toBeNull();
    for (const m of J.legalMoves(checked)) expect(J.inCheck({ ...J.play(checked, m)!, turn: "cho" })).toBe(false);
  });
  it("ends the game by 외통 when a check cannot be answered", () => {
    // Two chariots confine the king on the back rank.
    const s = position("K410 r19 r28 k52", "han");
    const mate = J.play(s, { from: sq(2, 8), to: sq(2, 10) })!;
    expect(mate.outcome).toEqual({ winner: "han", reason: "외통" });
    expect(J.legalMoves(mate)).toEqual([]);
    expect(J.play(mate, null)).toBeNull();
  });
  it("lets a side pass, and counts points when both pass in a row", () => {
    const s = J.createGame();
    const one = J.play(s, null)!;
    expect(one).toMatchObject({ turn: "han", outcome: null });
    expect(one.board).toBe(s.board);
    const two = J.play(one, null)!;
    expect(two.outcome).toEqual({ winner: "han", reason: "양쪽 한수쉼 — 점수 72 : 73.5" });
  });
  it("draws by 빅장 when facing kings are not broken by the reply", () => {
    const s = position("K59 R19 k42 r11");
    // Cho's king steps onto the open file opposite Han's king.
    const faced = J.play(s, { from: sq(5, 9), to: sq(4, 9) })!;
    expect(faced.bikjang).toBe("cho");
    expect(faced.outcome).toBeNull();
    const ignored = J.play(faced, { from: sq(1, 1), to: sq(1, 2) })!;
    expect(ignored.outcome).toEqual({ winner: null, reason: "빅장" });
    const broken = J.play(faced, { from: sq(4, 2), to: sq(5, 2) })!;
    expect(broken.outcome).toBeNull();
    expect(broken.bikjang).toBeNull();
  });
  it("draws when the same position comes up a third time", () => {
    let s = position("K59 R19 k42 r11");
    const cycle: [number, number][] = [
      [sq(1, 9), sq(1, 8)],
      [sq(1, 1), sq(1, 2)],
      [sq(1, 8), sq(1, 9)],
      [sq(1, 2), sq(1, 1)],
    ];
    for (let lap = 0; lap < 2; lap++)
      for (const [from, to] of cycle) {
        expect(s.outcome).toBeNull();
        s = J.play(s, { from, to })!;
      }
    expect(s.outcome).toEqual({ winner: null, reason: "같은 국면 3회 반복" });
  });
  it("refuses illegal moves and never changes its input", () => {
    const s = J.createGame(),
      before = frozen(s);
    expect(J.play(s, { from: sq(1, 10), to: sq(1, 5) })).toBeNull();
    expect(J.play(s, { from: sq(1, 4), to: sq(1, 5) })).toBeNull();
    expect(J.play(s, { from: sq(5, 5), to: sq(5, 4) })).toBeNull();
    expect(J.play(s, { from: -1, to: 200 })).toBeNull();
    J.play(s, { from: sq(1, 7), to: sq(1, 6) });
    J.legalMoves(s);
    expect(frozen(s)).toBe(before);
  });
  it("takes moves back by replay", () => {
    let s = J.createGame();
    const first = J.legalMoves(s)[0];
    s = J.play(s, first)!;
    const second = J.legalMoves(s)[0];
    const two = J.play(s, second)!;
    expect(J.undo(two)).toEqual(s);
    expect(J.undo(two, 2)).toEqual(J.createGame());
    for (const n of [0, 3, -1, 1.5]) expect(J.undo(two, n)).toBeNull();
  });
  it("describes moves by piece and coordinates", () => {
    const s = J.createGame();
    expect(J.describe(s.board, { from: sq(1, 7), to: sq(1, 6) }, "cho")).toBe("졸 71→61");
    expect(J.describe(s.board, { from: sq(9, 1), to: sq(9, 2) }, "han")).toBe("차 19→29");
    expect(J.describe(s.board, null, "cho")).toBe("한수쉼");
    expect(J.describe(s.board, { from: sq(1, 10), to: sq(1, 9) }, "cho")).toBe("차 01→91");
  });
});

import { search, profiles } from "../src/games/janggi/ai";
import { difficulties } from "../src/core/ai";
describe("Janggi computer", () => {
  it("returns a legal move at every level and never changes its input", () => {
    const s = J.createGame(),
      before = frozen(s);
    for (const d of difficulties) {
      const r = search(s, d, { timeMs: 400 });
      expect(r.pass).toBe(false);
      expect(J.play(s, r.move)).not.toBeNull();
      expect(r.depth).toBeGreaterThan(0);
    }
    expect(frozen(s)).toBe(before);
  });
  it("takes an unprotected chariot", () => {
    const s = position("K59 R19 r15 k52 P37");
    for (const d of ["easy", "normal", "hard", "expert"] as const)
      expect(search(s, d, { timeMs: 600 }).move).toEqual({ from: sq(1, 9), to: sq(1, 5) });
  });
  it("finds the mating move", () => {
    const s = position("K410 r19 r28 k52", "han");
    for (const d of ["normal", "hard", "expert"] as const) {
      const next = J.play(s, search(s, d, { timeMs: 800 }).move)!;
      expect(next.outcome).toEqual({ winner: "han", reason: "외통" });
    }
  });
  it("moves a chariot out of a pawn's reach rather than lose it", () => {
    // Han's pawn attacks the chariot beside it.
    const s = position("K59 R55 p54 k52 a41 P17");
    for (const d of ["normal", "hard"] as const) {
      const next = J.play(s, search(s, d, { timeMs: 800 }).move)!;
      const reply = search(next, "normal", { timeMs: 500 }).move!;
      expect(J.kindOf(next.board[reply.to]) === "R" && J.sideOf(next.board[reply.to]) === "cho").toBe(false);
    }
  });
  it("passes when it has no move and is not in check", () => {
    // Cho's lone king is boxed in by its own palace edge and attacked squares.
    const s = position("K410 r39 r58 k52", "cho");
    expect(J.legalMoves(s)).toEqual([]);
    expect(J.inCheck(s)).toBe(false);
    expect(search(s, "hard")).toMatchObject({ move: null, pass: true });
  });
  it("beats the beginner level from either side", () => {
    for (const strong of ["cho", "han"] as const) {
      let s = J.createGame();
      while (!s.outcome && s.moves.length < 160) {
        const level = s.turn === strong ? "normal" : "beginner",
          r = search(s, level, { timeMs: 150, seed: 3 });
        s = J.play(s, r.pass ? null : r.move)!;
      }
      // A win, or at least a clear lead when the move cap stops the game.
      const p = J.points(s.board),
        lead = strong === "cho" ? p.cho - p.han : p.han - p.cho;
      expect(s.outcome?.winner === strong || lead >= 13, `${strong}: ${JSON.stringify(s.outcome)} lead ${lead}`).toBe(true);
    }
    expect(profiles.expert.depth).toBeGreaterThan(profiles.hard.depth);
  }, 180000);
});
