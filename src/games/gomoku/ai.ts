import {
  inside,
  play,
  type Point,
  type State,
  type Player,
} from "./rules";
export function chooseMove(state: State): Point | null {
  if (state.winner !== null) return null;
  if (!state.moves.length) return { row: 7, col: 7 };
  const candidates: Point[] = [];
  for (let row = 0; row < 15; row++)
    for (let col = 0; col < 15; col++) {
      if (state.board[row][col]) continue;
      if (
        state.moves.some(
          (m) => Math.max(Math.abs(m.row - row), Math.abs(m.col - col)) <= 2,
        )
      )
        candidates.push({ row, col });
    }
  const opponent: Player = state.turn === 1 ? 2 : 1;
  for (const player of [state.turn, opponent])
    for (const p of candidates) {
      if (play({ ...state, turn: player }, p)?.winner === player) return p;
    }
  function score(p: Point, player: Player) {
    let value = 0;
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      let count = 1,
        open = 0;
      for (const sign of [-1, 1]) {
        let row = p.row + dr * sign,
          col = p.col + dc * sign;
        while (inside({ row, col }) && state.board[row][col] === player) {
          count++;
          row += dr * sign;
          col += dc * sign;
        }
        if (inside({ row, col }) && state.board[row][col] === 0) open++;
      }
      value += open ? Math.pow(8, count) * open : 0;
    }
    return value;
  }
  return (
    candidates.sort(
      (a, b) =>
        score(b, state.turn) +
        score(b, opponent) * 0.9 -
        Math.hypot(b.row - 7, b.col - 7) -
        (score(a, state.turn) +
          score(a, opponent) * 0.9 -
          Math.hypot(a.row - 7, a.col - 7)),
    )[0] ?? null
  );
}
