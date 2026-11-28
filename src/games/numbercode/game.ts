import type { Random } from "../../core/random";
import type { PointGame } from "../points/types";
import type { Level } from "../points/ai";
import { chooseMove } from "./ai";
import { createGame, hidden, hint, moves, play, reason, type State } from "./rules";

/** 숫자 코드 on the point-game screen: seat 0 is me (side 0); every computer is side 1. */
export const numberCode: PointGame<State> = {
  create: (_variant, options) => createGame(options),
  moves,
  play: (s, m) => play(s, m),
  choose: (s: State, level: Level, random: Random) => chooseMove(s, level, random),
  turn: (s) => (s.seat === 0 ? 0 : 1),
  winner: (s) => s.winner,
  owners: () => [],
  effect: () => null,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint,
  tally: (s) => {
    const alive = s.out.filter((o, seat) => seat > 0 && !o).length;
    return [`숨은 타일 ${hidden(s, 0)}장`, s.seats === 2 ? `숨은 타일 ${hidden(s, 1)}장` : `컴퓨터 ${alive}명 남음`];
  },
  reason,
};
