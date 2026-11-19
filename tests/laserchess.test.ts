import { describe, expect, it } from "vitest";
import * as L from "../src/games/laserchess/rules";
import { chooseMove } from "../src/games/laserchess/ai";
import { laserChessConfig } from "../src/games/laserchess/config";
import type { Move } from "../src/games/points/types";

const { LASER, KING, DEFLECTOR, SWITCH, SHIELD, TURN_LEFT, TURN_RIGHT, cellOf } = L;
type Placing = [kind: L.Kind, side: 0 | 1, r: number, c: number, dir: number];
/** A game on a board holding only the two lasers (facing as given) and the pieces listed. */
function position(pieces: Placing[], turn: 0 | 1 = 0, lasers: [number, number] = [0, 2]): L.State {
  const board = Array<number>(L.CELLS).fill(0);
  board[L.LASER_CELL[0]] = L.piece(LASER, 0, lasers[0]);
  board[L.LASER_CELL[1]] = L.piece(LASER, 1, lasers[1]);
  for (const [kind, side, r, c, dir] of pieces) board[cellOf(r, c)] = L.piece(kind, side, dir);
  return { ...L.createGame("classic"), board, turn };
}
const step = (from: number, to: number): Move => ({ from, to, extra: -1 });
const turn = (from: number, right: boolean): Move => ({ from, to: right ? TURN_RIGHT : TURN_LEFT, extra: -1 });
const legal = (s: L.State, m: Move) => L.moves(s).some((x) => x.from === m.from && x.to === m.to && x.extra === m.extra);
/** Whatever is fired from silver's laser, facing north up column 9, into a piece set at (4, 9). */
function hitColumn(p: number) {
  const board = Array<number>(L.CELLS).fill(0);
  board[L.LASER_CELL[0]] = L.piece(LASER, 0, 0);
  board[L.LASER_CELL[1]] = L.piece(LASER, 1, 2);
  board[cellOf(4, 9)] = p;
  return L.fire(board, 0);
}

describe("laser chess: the beam", () => {
  it("runs straight off the board when nothing stands in its way", () => {
    const shot = hitColumn(0);
    expect(shot.end).toBe("off");
    expect(shot.dir).toBe(0);
    expect(shot.path).toEqual([79, 69, 59, 49, 39, 29, 19, 9]);
  });
  it("is turned by a deflector's mirror and takes it on either plain side", () => {
    // A beam going north enters from the south side (2): a deflector facing south (dir 1: east and south, or dir 2:
    // south and west) turns it; facing north and east (0) or west and north (3) it is struck on a plain side.
    for (const side of [0, 1] as const) {
      expect(L.meet(L.piece(DEFLECTOR, side, 1), 0)).toBe(1);
      expect(L.meet(L.piece(DEFLECTOR, side, 2), 0)).toBe(3);
      expect(L.meet(L.piece(DEFLECTOR, side, 0), 0)).toBe(-2);
      expect(L.meet(L.piece(DEFLECTOR, side, 3), 0)).toBe(-2);
    }
    // Every facing and every way in: exactly two of the four ways in reflect, each to the other mirror face.
    for (let dir = 0; dir < 4; dir++) {
      const p = L.piece(DEFLECTOR, 0, dir),
        outs = [0, 1, 2, 3].map((d) => L.meet(p, d));
      expect(outs.filter((o) => o >= 0)).toHaveLength(2);
      for (let d = 0; d < 4; d++) {
        const from = (d + 2) % 4;
        if (from === dir) expect(outs[d]).toBe((dir + 1) % 4);
        else if (from === (dir + 1) % 4) expect(outs[d]).toBe(dir);
        else expect(outs[d]).toBe(-2);
      }
    }
    const turned = hitColumn(L.piece(DEFLECTOR, 1, 2));
    expect(turned.end).toBe("off");
    expect(turned.dir).toBe(3);
    expect(turned.path.at(-1)).toBe(cellOf(4, 0));
    const taken = hitColumn(L.piece(DEFLECTOR, 1, 0));
    expect(taken.end).toBe("take");
    expect(taken.taken).toBe(L.piece(DEFLECTOR, 1, 0));
  });
  it("is turned by a switch from every side, and a switch is never taken", () => {
    for (const dir of [0, 1])
      for (let d = 0; d < 4; d++) {
        const out = L.meet(L.piece(SWITCH, 0, dir), d);
        expect(out).toBeGreaterThanOrEqual(0);
        // A quarter turn either way, never straight on or back.
        expect(out % 2).not.toBe(d % 2);
      }
    // "\" sends a beam going north to the west; "/" sends it to the east.
    expect(L.meet(L.piece(SWITCH, 1, 0), 0)).toBe(3);
    expect(L.meet(L.piece(SWITCH, 1, 1), 0)).toBe(1);
    // A switch turned twice is as it was: its two faces are both mirrors.
    expect(L.turned(L.turned(L.piece(SWITCH, 0, 1), TURN_LEFT), TURN_RIGHT)).toBe(L.piece(SWITCH, 0, 1));
    expect(L.turned(L.piece(SWITCH, 0, 0), TURN_LEFT)).toBe(L.turned(L.piece(SWITCH, 0, 0), TURN_RIGHT));
  });
  it("is stopped by a shield's front and takes a shield struck anywhere else", () => {
    // The beam goes north, so it meets the face that looks south.
    expect(hitColumn(L.piece(SHIELD, 0, 2)).end).toBe("block");
    for (const dir of [0, 1, 3]) {
      const shot = hitColumn(L.piece(SHIELD, 1, dir));
      expect(shot.end).toBe("take");
      expect(shot.path.at(-1)).toBe(cellOf(4, 9));
    }
  });
  it("takes a king struck from any side and is stopped by a laser", () => {
    for (let dir = 0; dir < 4; dir++) expect(hitColumn(L.piece(KING, 1, dir)).end).toBe("take");
    // Gold's laser in silver's beam: turned at (0, 9) toward the far corner, the beam stops there.
    const s = position([[DEFLECTOR, 0, 0, 9, 2]]);
    const shot = L.fire(s.board, 0);
    expect(shot.end).toBe("block");
    expect(shot.path.at(-1)).toBe(L.LASER_CELL[1]);
  });
  it("follows a path through several mirrors", () => {
    // North up column 9, west along row 4, north up column 2, east along row 1 into a gold shield's side.
    const s = position([
      [DEFLECTOR, 0, 4, 9, 2],
      [SWITCH, 1, 4, 2, 0],
      [DEFLECTOR, 1, 1, 2, 1],
      [SHIELD, 1, 1, 6, 0],
    ]);
    const shot = L.fire(s.board, 0);
    expect(shot.end).toBe("take");
    expect(shot.path.at(-1)).toBe(cellOf(1, 6));
    expect(shot.path).toContain(cellOf(4, 5));
    expect(shot.path).toContain(cellOf(2, 2));
  });
});

describe("laser chess: turns", () => {
  it("takes what the shot takes, one's own pieces included", () => {
    // Silver moves a deflector into its own column with its plain side to the beam: its own shot takes it.
    const s = position([[DEFLECTOR, 0, 4, 8, 0]]);
    const next = L.play(s, step(cellOf(4, 8), cellOf(4, 9)))!;
    expect(next.last!.shot.end).toBe("take");
    expect(next.board[cellOf(4, 9)]).toBe(0);
    expect(next.lost[0]).toEqual([L.piece(DEFLECTOR, 0, 0)]);
    expect(next.winner).toBeNull();
    // Turned so that its mirror meets the beam, it sends the beam west along row 4 into a gold shield's side.
    const t = position([
      [DEFLECTOR, 0, 4, 9, 3],
      [SHIELD, 1, 4, 3, 0],
    ]);
    const shot = L.play(t, turn(cellOf(4, 9), false))!;
    expect(shot.board[cellOf(4, 9)]).toBe(L.piece(DEFLECTOR, 0, 2));
    expect(shot.last!.shot.taken).toBe(L.piece(SHIELD, 1, 0));
    expect(shot.lost[1]).toHaveLength(1);
    expect(shot.turn).toBe(1);
    expect(shot.ply).toBe(1);
  });
  it("lets a switch change places with a deflector or a shield of either side, and with nothing else", () => {
    const sw = cellOf(4, 4);
    const s = position([
      [SWITCH, 0, 4, 4, 0],
      [DEFLECTOR, 1, 3, 4, 0],
      [SHIELD, 0, 4, 5, 0],
      [SHIELD, 1, 5, 3, 1],
      [KING, 0, 5, 5, 0],
      [SWITCH, 1, 3, 3, 0],
    ]);
    for (const other of [cellOf(3, 4), cellOf(4, 5), cellOf(5, 3)]) {
      expect(legal(s, step(sw, other))).toBe(true);
      const next = L.play(s, step(sw, other))!;
      expect(next.board[other]).toBe(L.piece(SWITCH, 0, 0));
      expect(next.board[sw]).toBe(s.board[other]);
    }
    expect(legal(s, step(sw, cellOf(5, 5)))).toBe(false);
    expect(legal(s, step(sw, cellOf(3, 3)))).toBe(false);
    // Other pieces only step onto empty squares.
    expect(legal(s, step(cellOf(4, 5), cellOf(5, 5)))).toBe(false);
    expect(legal(s, step(cellOf(4, 5), cellOf(3, 5)))).toBe(true);
  });
  it("keeps each side off the other's reserved squares, by a step or a swap", () => {
    expect(L.RESERVED.filter((r) => r === 0)).toHaveLength(9);
    expect(L.RESERVED.filter((r) => r === 1)).toHaveLength(9);
    const s = position([
      [DEFLECTOR, 0, 3, 1, 0],
      [DEFLECTOR, 0, 1, 2, 0],
      [SWITCH, 1, 5, 8, 0],
      [DEFLECTOR, 0, 5, 9, 1],
    ]);
    // Silver may not step into column 0 nor onto the square beside gold's laser.
    expect(legal(s, step(cellOf(3, 1), cellOf(3, 0)))).toBe(false);
    expect(legal(s, step(cellOf(1, 2), cellOf(0, 1)))).toBe(false);
    expect(legal(s, step(cellOf(3, 1), cellOf(2, 1)))).toBe(true);
    // Gold's switch may not swap into silver's column, nor step there.
    const g = { ...s, turn: 1 as const };
    expect(legal(g, step(cellOf(5, 8), cellOf(5, 9)))).toBe(false);
    expect(legal(g, step(cellOf(5, 8), cellOf(4, 9)))).toBe(false);
    expect(legal(g, step(cellOf(5, 8), cellOf(5, 7)))).toBe(true);
    // A swap is refused where the other piece would land on a square reserved against it.
    const t = position([
      [SWITCH, 1, 3, 0, 0],
      [DEFLECTOR, 0, 3, 1, 0],
    ], 1);
    expect(legal(t, step(cellOf(3, 0), cellOf(3, 1)))).toBe(false);
  });
  it("turns pieces a quarter, the laser only between its two facings, and never moves the laser", () => {
    const s = L.createGame("classic");
    const laser = L.moves(s).filter((m) => m.from === L.LASER_CELL[0]);
    expect(laser).toEqual([turn(L.LASER_CELL[0], false)]);
    const west = L.play(s, laser[0])!;
    expect(L.dirOf(west.board[L.LASER_CELL[0]])).toBe(3);
    const back = L.play({ ...west, turn: 0 }, turn(L.LASER_CELL[0], true))!;
    expect(L.dirOf(back.board[L.LASER_CELL[0]])).toBe(0);
    expect(L.moves(west).filter((m) => m.from === L.LASER_CELL[1])).toEqual([turn(L.LASER_CELL[1], false)]);
    // A king is only moved.
    expect(L.moves(s).filter((m) => m.from === cellOf(7, 4) && m.to >= L.CELLS)).toEqual([]);
    expect(L.turned(L.piece(DEFLECTOR, 0, 3), TURN_RIGHT)).toBe(L.piece(DEFLECTOR, 0, 0));
    expect(L.turned(L.piece(SHIELD, 1, 0), TURN_LEFT)).toBe(L.piece(SHIELD, 1, 3));
  });
  it("refuses a move that is not legal and never changes the state it is given", () => {
    const s = L.createGame("attack"),
      copy = JSON.stringify(s);
    expect(L.play(s, step(L.LASER_CELL[0], cellOf(6, 9)))).toBeNull();
    expect(L.play(s, step(cellOf(0, 0), cellOf(1, 0)))).toBeNull();
    expect(L.play(s, step(cellOf(7, 2), cellOf(5, 2)))).toBeNull();
    L.play(s, L.moves(s)[3]);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("laser chess: the end", () => {
  it("is lost by the side whose king is hit", () => {
    const s = position([
      [DEFLECTOR, 0, 2, 8, 2],
      [KING, 1, 2, 3, 0],
      [KING, 0, 7, 4, 0],
    ]);
    const won = L.play(s, step(cellOf(2, 8), cellOf(2, 9)))!;
    expect(won.last!.shot.taken).toBe(L.piece(KING, 1, 0));
    expect(won.winner).toBe(0);
    expect(L.moves(won)).toEqual([]);
    expect(L.reasonOf(won)).toBe("금빛 왕이 은빛 레이저에 맞았습니다.");
  });
  it("is lost by the mover whose own shot hits its own king", () => {
    const s = position([
      [DEFLECTOR, 0, 6, 8, 2],
      [KING, 0, 6, 3, 0],
      [KING, 1, 0, 4, 0],
    ]);
    const lost = L.play(s, step(cellOf(6, 8), cellOf(6, 9)))!;
    expect(lost.winner).toBe(1);
    expect(L.reasonOf(lost)).toBe("은빛 왕이 제 편 레이저에 맞았습니다.");
  });
  it("is drawn after the limit of moves", () => {
    let s = L.createGame("classic");
    // Both lasers turned to and fro: the beams go off the board every time.
    while (s.winner === null) s = L.play(s, L.moves(s).find((m) => m.from === L.LASER_CELL[s.turn])!)!;
    expect(s.winner).toBe("draw");
    expect(s.ply).toBe(L.LIMIT);
  });
});

describe("laser chess: the starting positions", () => {
  it("give both sides the same pieces, half turned round the board", () => {
    for (const variant of L.VARIANTS) {
      const s = L.createGame(variant);
      for (const side of [0, 1] as const) {
        const kinds = s.board.filter((p) => p && L.sideOf(p) === side).map((p) => L.kindOf(p));
        const count = (k: number) => kinds.filter((x) => x === k).length;
        expect([count(LASER), count(KING), count(DEFLECTOR), count(SWITCH), count(SHIELD)]).toEqual([1, 1, 7, 2, 2]);
      }
      for (let cell = 0; cell < L.CELLS; cell++) {
        const p = s.board[cell],
          q = s.board[L.CELLS - 1 - cell];
        expect(!!p).toBe(!!q);
        if (p) {
          expect(L.sideOf(q)).toBe(1 - L.sideOf(p));
          expect(L.kindOf(q)).toBe(L.kindOf(p));
        }
        // Nothing starts on a square reserved for the other side.
        if (p) expect(L.allowed(cell, L.sideOf(p))).toBe(true);
      }
    }
    expect(L.startBoard("classic")).not.toEqual(L.startBoard("attack"));
  });
  it("let no first shot of either side take anything, whatever the first moves", () => {
    for (const variant of L.VARIANTS) {
      const s = L.createGame(variant);
      expect(L.fire(s.board, 0).end).toBe("off");
      expect(L.fire(s.board, 1).end).toBe("off");
      for (const first of L.moves(s)) {
        const a = L.play(s, first)!;
        expect(a.last!.shot.end).not.toBe("take");
        for (const reply of L.moves(a)) expect(L.play(a, reply)!.last!.shot.end).not.toBe("take");
      }
    }
  });
});

describe("laser chess: undo", () => {
  it("rebuilds the game one move back by playing its moves again", () => {
    let s = L.createGame("attack");
    const states = [s];
    const line = [
      step(cellOf(4, 6), cellOf(3, 7)),
      turn(L.LASER_CELL[1], false),
      step(cellOf(3, 7), cellOf(2, 8)),
      turn(L.LASER_CELL[1], true),
      step(cellOf(2, 8), cellOf(1, 9)),
    ];
    for (const move of line) {
      s = L.play(s, move)!;
      states.push(s);
    }
    // The last move took a gold shield.
    expect(s.lost[1]).toHaveLength(1);
    for (let k = line.length; k > 0; k--) {
      expect(L.undo(states[k])).toEqual(states[k - 1]);
    }
    expect(L.undo(states[0])).toBe(states[0]);
  });
});

describe("laser chess: the computer", () => {
  const exposed = () =>
    position([
      [DEFLECTOR, 0, 3, 8, 2],
      [KING, 1, 3, 2, 0],
      [KING, 0, 7, 4, 0],
      [DEFLECTOR, 1, 1, 4, 1],
      [SHIELD, 1, 2, 2, 2],
    ]);
  it("takes an exposed king in one at every level", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const move = chooseMove(exposed(), level, () => 0.01);
      expect(move).toEqual(step(cellOf(3, 8), cellOf(3, 9)));
      expect(L.play(exposed(), move!)!.winner).toBe(0);
    }
    // Gold sees the same, the other way round.
    const gold = position([
      [DEFLECTOR, 1, 4, 1, 0],
      [KING, 0, 4, 7, 0],
      [KING, 1, 0, 5, 0],
    ], 1);
    const move = chooseMove(gold, "normal", () => 0.5);
    expect(L.play(gold, move!)!.winner).toBe(1);
  });
  it("does not walk into its own beam, and blocks a king hit that is one move away", () => {
    // Silver's laser points west along row 7 at silver's own king; any quiet move loses, so the laser must be turned
    // north or something set in the way.
    const s = position([
      [KING, 0, 7, 3, 0],
      [DEFLECTOR, 0, 5, 5, 0],
      [KING, 1, 0, 5, 0],
    ], 0, [3, 2]);
    for (const level of ["easy", "normal"] as const) {
      const move = chooseMove(s, level, () => 0.3)!;
      expect(L.play(s, move)!.winner).not.toBe(1);
    }
    // Gold could take silver's king next move: a gold deflector stepping to (6, 0) turns gold's laser, which fires
    // down column 0, east along row 6. Silver must see it and step its king off the row (not to row 5, which a step
    // to (5, 0) opens as well).
    const t = position([
      [KING, 0, 6, 5, 0],
      [DEFLECTOR, 1, 5, 1, 0],
      [KING, 1, 0, 5, 0],
      [SHIELD, 0, 7, 6, 0],
    ]);
    const threat = L.play({ ...t, turn: 1 }, step(cellOf(5, 1), cellOf(6, 0)))!;
    expect(threat.winner).toBe(1);
    const answer = chooseMove(t, "normal", () => 0.3)!,
      after = L.play(t, answer)!;
    expect(after.winner).toBeNull();
    expect(L.moves(after).every((m) => L.play(after, m)!.winner !== 1)).toBe(true);
  });
  it("answers within its time and plays a legal move", () => {
    const s = L.createGame("classic");
    for (const level of ["easy", "normal"] as const) {
      const t = performance.now(),
        move = chooseMove(s, level, Math.random);
      expect(performance.now() - t).toBeLessThan(level === "easy" ? 1500 : 2500);
      expect(legal(s, move!)).toBe(true);
    }
    // To a fixed depth, the search plays the same whatever the clock.
    let ticks = 0;
    const move = chooseMove(s, "hard", () => 0, () => ticks++ * 0, 1e9, 2);
    expect(legal(s, move!)).toBe(true);
  });
});

describe("laser chess: the screen's texts", () => {
  it("names the set-up and the sides, and calls what a shot takes", () => {
    expect(laserChessConfig.tableNote("attack", {})).toBe("공격형 배치 · 은빛 선공");
    expect(laserChessConfig.variants?.map((v) => v.value)).toEqual(["classic", "attack"]);
    const s = position([
      [DEFLECTOR, 0, 4, 9, 3],
      [SHIELD, 1, 4, 3, 0],
    ]);
    const next = L.play(s, turn(cellOf(4, 9), false))!;
    expect(laserChessConfig.cheer?.(s, next, "local")).toBe("명중!");
    const own = position([[DEFLECTOR, 0, 4, 8, 0]]);
    expect(laserChessConfig.cheer?.(own, L.play(own, step(cellOf(4, 8), cellOf(4, 9)))!, "ai")).toBe("오발!");
    expect(laserChessConfig.rules).toContain("기본 규칙");
    expect(laserChessConfig.rules).not.toContain("<h3>조작");
  });
});
