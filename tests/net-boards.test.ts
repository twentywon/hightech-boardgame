import { describe, expect, test } from "vitest";
import { HOST_ONLY, Match, NOBODY, type NetRules } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import type { SeatInfo, StartInfo } from "../src/net/protocol";
import type { GameOptions, Move } from "../src/games/points/types";
import {
  CLAIM,
  chessAction,
  chessMove,
  chessNet,
  choosing,
  formationMove,
  gomokuMove,
  gomokuNet,
  janggiMove,
  janggiNet,
  reversiMove,
  reversiNet,
  squareAt,
  squareIndex,
  type BoardNet,
} from "../src/net/boards";
import * as chess from "../src/games/chess/rules";
import * as gomoku from "../src/games/gomoku/rules";
import * as reversi from "../src/games/reversi/rules";
import * as janggi from "../src/games/janggi/rules";

/** Lets every queued message be delivered (each hop is a microtask). */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const seatsOf = <S>(net: BoardNet<S>): SeatInfo[] => net.seats.map((s) => ({ ...s, kind: "open", person: null }));

/** A host (seat 0) and a guest (seat 1) joined by memory links, the game begun with `options`. */
async function pair<S>(net: BoardNet<S>, options: GameOptions = {}) {
  const host = new HostRoom<S>({ game: net.game, title: net.game, name: "방장", variant: "", options, seats: seatsOf(net), quiet: true }, net, "host");
  const guest = new GuestRoom<S>({ game: net.game, title: net.game, name: "민수", quiet: true }, net, "guest");
  const [a, b] = memoryLinks();
  host.connect(a);
  guest.connect(b);
  await settle();
  expect(host.mySeat).toBe(0);
  expect(guest.mySeat).toBe(1);
  host.begin();
  await settle();
  const refused: string[] = [];
  guest.events.refused = (text) => refused.push(text);
  /** Plays a move from the device of the seat to move. */
  const move = async (m: Move) => {
    const to = host.match!.toMove,
      text = to === 0 ? host.play(m, 0) : guest.play(m);
    await settle();
    return text;
  };
  const same = () => {
    expect(guest.match!.ply).toBe(host.match!.ply);
    expect(guest.match!.moves).toEqual(host.match!.moves);
    expect(guest.match!.state).toEqual(host.match!.state);
  };
  /** The guest asks to take its last move back and the host accepts. */
  const undo = async () => {
    let asked = -1;
    host.events.asked = (a) => (asked = a.id);
    expect(guest.request("undo")).toBeNull();
    await settle();
    expect(asked).toBeGreaterThan(0);
    host.answer(asked, true);
    await settle();
  };
  return { host, guest, move, same, undo, refused };
}

describe("moves as a room sends them", () => {
  test("chess squares, promotions and claims go out and come back as they were", () => {
    for (let i = 0; i < 64; i++) expect(squareIndex(squareAt(i))).toBe(i);
    expect(squareAt(0)).toBe("a1");
    expect(squareAt(63)).toBe("h8");
    const cases: [chess.Action | null, boolean][] = [
      [{ from: "e2", to: "e4" }, false],
      [{ from: "a7", to: "a8", promotion: "n" }, false],
      [{ from: "g1", to: "f3" }, true],
      [null, true],
    ];
    for (const [action, claim] of cases) expect(chessAction(chessMove(action, claim))).toEqual({ action, claim });
    expect(chessMove(null, true)).toEqual({ from: -1, to: -1, extra: CLAIM });
    // Anything else is no move at all.
    expect(chessAction({ from: 64, to: 0, extra: 0 })).toBeNull();
    expect(chessAction({ from: 12, to: 28, extra: 5 })).toBeNull();
    expect(chessAction({ from: -1, to: -1, extra: 0 })).toBeNull();
    expect(chessNet.play(chess.createGame(), { from: 12, to: 28, extra: 5 }, Math.random)).toBeNull();
    expect(gomokuNet.play(gomoku.createGame(), { from: -1, to: 225, extra: -1 }, Math.random)).toBeNull();
    expect(reversiNet.play(reversi.createGame(), { from: 3, to: 19, extra: -1 }, Math.random)).toBeNull();
  });

  test("two devices given one start and the same moves reach the same state as the rules alone", () => {
    const start: StartInfo = { round: 1, variant: "", options: {}, seed: 7, seats: [] };
    const sameEverywhere = <S>(net: NetRules<S>, moves: Move[], alone: S) => {
      const one = new Match(net, start),
        two = new Match(net, start);
      for (const m of moves) {
        const seat = one.toMove;
        expect(one.push(m, seat)).not.toBeNull();
        expect(two.push(m, seat)).not.toBeNull();
      }
      expect(one.state).toEqual(two.state);
      expect(one.state).toEqual(alone);
    };
    // Chess: a short opening with castling.
    const line: chess.Action[] = [
      { from: "e2", to: "e4" },
      { from: "e7", to: "e5" },
      { from: "g1", to: "f3" },
      { from: "b8", to: "c6" },
      { from: "f1", to: "c4" },
      { from: "g8", to: "f6" },
      { from: "e1", to: "g1" },
    ];
    sameEverywhere(chessNet, line.map((a) => chessMove(a)), line.reduce((s, a) => chess.play(s, a)!, chess.createGame()));
    // Gomoku.
    const stones = [{ row: 7, col: 7 }, { row: 7, col: 8 }, { row: 8, col: 8 }, { row: 6, col: 6 }];
    sameEverywhere(gomokuNet, stones.map(gomokuMove), stones.reduce((s, p) => gomoku.play(s, p)!, gomoku.createGame()));
    // Reversi.
    const discs = [19, 18, 17].map(reversi.point);
    sameEverywhere(reversiNet, discs.map(reversiMove), discs.reduce((s, p) => reversi.play(s, p)!, reversi.createGame()));
    // Janggi: the formations first, then moves and a pass.
    const moves: (janggi.Move | null)[] = [{ from: janggi.at(0, 6), to: janggi.at(0, 5) }, null, { from: janggi.at(2, 6), to: janggi.at(2, 5) }];
    let alone = janggi.createGame("ENEN", "NEEN");
    for (const m of moves) alone = janggi.play(alone, m)!;
    sameEverywhere(janggiNet, [formationMove("ENEN"), formationMove("NEEN"), ...moves.map(janggiMove)], { picks: ["ENEN", "NEEN"], game: alone });
  });
});

describe("chess over a room", () => {
  test("moves in turn agree on both devices; out of turn and illegal moves are refused; an undo rebuilds both", async () => {
    const { host, guest, move, same, undo, refused } = await pair(chessNet);
    // White (the host) moves first: the guest is refused, here and at the host.
    expect(guest.play(chessMove({ from: "e7", to: "e5" }))).toBe("상대 차례입니다.");
    expect(await move(chessMove({ from: "e2", to: "e5" }))).toBe("둘 수 없는 수입니다.");
    for (const a of [
      { from: "e2", to: "e4" },
      { from: "e7", to: "e5" },
      { from: "d1", to: "h5" },
      { from: "b8", to: "c6" },
    ] as chess.Action[])
      expect(await move(chessMove(a))).toBeNull();
    same();
    expect(host.match!.state.moves).toHaveLength(4);
    expect(host.play(chessMove({ from: "e7", to: "e6" }), 0)).toBe("둘 수 없는 수입니다.");
    // A sneaky move of the guest's sent out of turn is refused by the host too.
    (guest as unknown as { say(m: object): void }).say({ t: "move", round: 1, ply: 4, move: chessMove({ from: "g8", to: "f6" }), seat: 1 });
    await settle();
    expect(refused).toEqual(["상대 차례입니다."]);
    // The host moves; the guest takes back its own last move (and the host's reply after it).
    const before = host.match!.states[3];
    expect(await move(chessMove({ from: "f1", to: "c4" }))).toBeNull();
    await undo();
    expect(host.match!.ply).toBe(3);
    same();
    expect(host.match!.state).toEqual(before);
    expect(guest.match!.state).toEqual(chess.undo(chess.play(before, { from: "b8", to: "c6" })!, 1));
    // Played on to a mate: the room is over for both.
    for (const a of [
      { from: "b8", to: "c6" },
      { from: "f1", to: "c4" },
      { from: "g8", to: "f6" },
      { from: "h5", to: "f7" },
    ] as chess.Action[])
      expect(await move(chessMove(a))).toBeNull();
    same();
    expect(host.match!.state.outcome).toEqual({ winner: "w", reason: "체크메이트" });
    expect(host.match!.toMove).toBe(NOBODY);
    expect(chessNet.result(guest.match!.state)).toBe(0);
    expect(guest.play(chessMove({ from: "a7", to: "a6" }))).toBe("게임이 끝났습니다.");
  });

  test("a draw claim is a move of the side to move, and a promotion travels with its piece", async () => {
    const { host, guest, move, same } = await pair(chessNet);
    const knights: chess.Action[] = [
      { from: "g1", to: "f3" },
      { from: "g8", to: "f6" },
      { from: "f3", to: "g1" },
      { from: "f6", to: "g8" },
    ];
    for (const a of [...knights, ...knights]) expect(await move(chessMove(a))).toBeNull();
    // The start position a third time with White to move: Black (the guest) may not claim for White…
    expect(guest.play(chessMove(null, true))).toBe("상대 차례입니다.");
    // …a claim where none stands is no move…
    expect(host.play(chessMove({ from: "e2", to: "e4" }, true), 0)).toBe("둘 수 없는 수입니다.");
    // …and White's claim ends the game on both devices.
    expect(host.play(chessMove(null, true), 0)).toBeNull();
    await settle();
    same();
    expect(guest.match!.state.outcome).toEqual({ winner: null, reason: "3회 반복 청구" });
    expect(chessNet.result(guest.match!.state)).toBe("draw");

    // A promotion: from a set position, played through a match.
    const promo = { ...chessNet, create: () => chess.createGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1") };
    const one = new Match(promo, { round: 1, variant: "", options: {}, seed: 1, seats: [] });
    expect(one.push(chessMove({ from: "a7", to: "a8", promotion: "n" }), 0)).not.toBeNull();
    expect(chess.createEngine(one.state).get("a8")).toEqual({ type: "n", color: "w" });
  });
});

describe("gomoku over a room", () => {
  test("the host's 삼삼 rule is the room's; stones agree; out of turn refused; an undo rebuilds both", async () => {
    const { host, guest, move, same, undo } = await pair(gomokuNet, { noDoubleThree: true });
    expect(host.match!.state.noDoubleThree).toBe(true);
    expect(guest.match!.state.noDoubleThree).toBe(true);
    expect(guest.play(gomokuMove({ row: 0, col: 0 }))).toBe("상대 차례입니다.");
    // Black builds toward a double three at (7,7): (7,5),(7,6) and (5,7),(6,7); White plays far away.
    const line = [
      { row: 7, col: 5 },
      { row: 0, col: 0 },
      { row: 7, col: 6 },
      { row: 0, col: 2 },
      { row: 5, col: 7 },
      { row: 0, col: 4 },
      { row: 6, col: 7 },
      { row: 0, col: 6 },
    ];
    for (const p of line) expect(await move(gomokuMove(p))).toBeNull();
    // The double three is refused to Black through the room, as by the rules.
    expect(gomoku.doubleThree(host.match!.state.board, { row: 7, col: 7 }, 1)).toBe(true);
    expect(await move(gomokuMove({ row: 7, col: 7 }))).toBe("둘 수 없는 수입니다.");
    // A taken point is refused.
    expect(await move(gomokuMove({ row: 0, col: 0 }))).toBe("둘 수 없는 수입니다.");
    same();
    expect(await move(gomokuMove({ row: 10, col: 10 }))).toBeNull();
    const before = host.match!.state;
    // White's last stone, and Black's after it, are taken back on both devices.
    expect(await move(gomokuMove({ row: 1, col: 1 }))).toBeNull();
    expect(await move(gomokuMove({ row: 11, col: 11 }))).toBeNull();
    const last = host.match!.state;
    await undo();
    same();
    expect(host.match!.state).toEqual(before);
    expect(guest.match!.state).toEqual(gomoku.undo(last, 2));
    expect(guest.match!.state.moves).toHaveLength(line.length + 1);
  });

  test("five in a row ends the game and tells each device its own end", async () => {
    const { host, guest, move, same } = await pair(gomokuNet);
    for (let i = 0; i < 4; i++) {
      await move(gomokuMove({ row: 3, col: i }));
      await move(gomokuMove({ row: 9, col: i }));
    }
    await move(gomokuMove({ row: 3, col: 4 }));
    same();
    expect(guest.match!.toMove).toBe(NOBODY);
    expect(gomokuNet.result(guest.match!.state)).toBe(0);
    expect(gomokuNet.result(host.match!.state)).toBe(host.mySeat);
  });
});

describe("Reversi over a room", () => {
  test("a whole game agrees on both devices, passes included, and a device joining late replays it", async () => {
    const { host, guest, move, same } = await pair(reversiNet);
    expect(guest.play(reversiMove({ row: 2, col: 3 }))).toBe("상대 차례입니다.");
    expect(await move(reversiMove({ row: 0, col: 0 }))).toBe("둘 수 없는 수입니다.");
    for (let i = 0; i < 70 && host.match!.toMove !== NOBODY; i++) {
      const s = host.match!.state,
        // The last legal move each time: a game that runs into passes now and then.
        choice = reversi.legalMoves(s.board, s.turn).at(-1)!;
      expect(await move(reversiMove(reversi.point(choice.index)))).toBeNull();
    }
    same();
    expect(host.match!.toMove).toBe(NOBODY);
    expect(reversiNet.result(guest.match!.state)).toBe(host.match!.state.winner === "draw" ? "draw" : host.match!.state.winner! - 1);
    // A page joining afresh is told the start and the list, and rebuilds the same game, passes reconstructed.
    const late = new GuestRoom<reversi.State>({ game: "reversi", title: "리버시", name: "지아", quiet: true }, reversiNet, "late");
    const [a, b] = memoryLinks();
    host.connect(a);
    late.connect(b);
    await settle();
    expect(late.match!.state).toEqual(host.match!.state);
    expect(late.match!.state.passes).toEqual(host.match!.state.passes);
  });

  test("an undo through the room goes back to the guest's turn on both devices", async () => {
    const { host, guest, move, same, undo } = await pair(reversiNet);
    for (const p of [
      { row: 2, col: 3 },
      { row: 2, col: 2 },
      { row: 3, col: 2 },
    ])
      expect(await move(reversiMove(p))).toBeNull();
    const before = host.match!.states[1];
    await undo();
    same();
    expect(host.match!.ply).toBe(1);
    expect(guest.match!.state).toEqual(before);
    expect(guest.match!.state).toEqual(reversi.undo(reversi.play(reversi.play(before, { row: 2, col: 2 })!, { row: 3, col: 2 })!, 2));
    expect(guest.match!.toMove).toBe(1);
  });
});

describe("janggi over a room", () => {
  test("each side's formation is chosen on its own device, then the game goes on in turn; formations are never taken back", async () => {
    const { host, guest, move, same, undo } = await pair(janggiNet);
    expect(choosing(host.match!.state)).toBe(true);
    // 초 (the host) chooses first; 한 may not choose for it, nor move a piece yet.
    expect(guest.play(formationMove("ENNE"))).toBe("상대 차례입니다.");
    expect(host.play(janggiMove({ from: janggi.at(0, 6), to: janggi.at(0, 5) }), 0)).toBe("둘 수 없는 수입니다.");
    expect(await move(formationMove("ENEN"))).toBeNull();
    expect(host.match!.toMove).toBe(1);
    expect(await move(formationMove("NEEN"))).toBeNull();
    same();
    expect(choosing(guest.match!.state)).toBe(false);
    expect(guest.match!.state.game).toEqual(janggi.createGame("ENEN", "NEEN"));
    // A formation stands: with no move of its own yet, 한 has nothing to take back.
    expect(guest.request("undo")).toBe("아직 무를 수가 없습니다.");
    expect(host.match!.undoFor(0)).toBeNull();
    // 초 moves, 한 passes, 초 moves again.
    expect(guest.play(janggiMove({ from: janggi.at(0, 3), to: janggi.at(0, 4) }))).toBe("상대 차례입니다.");
    expect(await move(janggiMove({ from: janggi.at(0, 6), to: janggi.at(0, 5) }))).toBeNull();
    expect(await move(janggiMove(null))).toBeNull();
    expect(await move(janggiMove({ from: janggi.at(2, 6), to: janggi.at(2, 5) }))).toBeNull();
    same();
    expect(guest.match!.state.game.moves).toEqual([{ from: janggi.at(0, 6), to: janggi.at(0, 5) }, null, { from: janggi.at(2, 6), to: janggi.at(2, 5) }]);
    // 한 takes its pass back (and 초's move after it): both devices replay to the same board.
    await undo();
    same();
    expect(host.match!.ply).toBe(3);
    expect(guest.match!.state.game).toEqual(janggi.play(janggi.createGame("ENEN", "NEEN"), { from: janggi.at(0, 6), to: janggi.at(0, 5) }));
    expect(guest.match!.state.picks).toEqual(["ENEN", "NEEN"]);
  });

  test("the host's computer may take a seat and its moves go through the room", async () => {
    const host = new HostRoom<ReturnType<typeof janggiNet.create>>({ game: "janggi", title: "장기", name: "방장", variant: "", options: {}, seats: seatsOf(janggiNet), quiet: true }, janggiNet, "host");
    host.setKind(1, "computer");
    host.begin();
    expect(host.play(formationMove("NENE"), 0)).toBeNull();
    // The computer's seat is played from the host's device.
    expect(host.play(formationMove("ENNE"), 1)).toBeNull();
    expect(host.match!.state.game).toEqual(janggi.createGame("NENE", "ENNE"));
    expect(host.match!.toMove).not.toBe(HOST_ONLY);
  });
});
