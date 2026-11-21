import type { Chess, Color, PieceSymbol } from "chess.js";
export const values: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};
export function evaluate(
  game: Chess,
  advanced = false,
  simple = false,
  legalCount?: number,
): number {
  const board = game.board();
  let white = 0,
    phase = 0;
  const pawns: Record<Color, [number, number][]> = { w: [], b: [] };
  const kings: Partial<Record<Color, [number, number]>> = {};
  const pieces = board.flat().filter((p) => !!p);
  for (const p of pieces)
    if (p.type !== "p" && p.type !== "k") phase += values[p.type];
  const endgame = phase < 2200;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const p = board[row][col];
      if (!p) continue;
      const advance = p.color === "w" ? 6 - row : row - 1;
      const central = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
      let score = values[p.type];
      if (p.type === "p") {
        score += advance * (endgame ? 12 : 6) + central * 2;
        pawns[p.color].push([row, col]);
      }
      if (p.type === "n") score += central * 12 - 35;
      if (p.type === "b") score += central * 6;
      if (p.type === "q") score += central * 2;
      if (p.type === "r") score += advance * 2;
      if (p.type === "k") {
        kings[p.color] = [row, col];
        score += endgame
          ? central * 12
          : -central * 8 + ([2, 6].includes(col) ? 25 : 0);
      }
      if (!simple && p.type !== "p" && p.type !== "k") {
        const dirs =
          p.type === "n"
            ? [
                [1, 2],
                [2, 1],
                [-1, 2],
                [-2, 1],
                [1, -2],
                [2, -1],
                [-1, -2],
                [-2, -1],
              ]
            : p.type === "b"
              ? [
                  [1, 1],
                  [1, -1],
                  [-1, 1],
                  [-1, -1],
                ]
              : p.type === "r"
                ? [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                  ]
                : [
                    [1, 1],
                    [1, -1],
                    [-1, 1],
                    [-1, -1],
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                  ];
        let activity = 0;
        for (const [dr, dc] of dirs)
          for (let n = 1; n <= 7; n++) {
            const r = row + dr * n,
              c = col + dc * n;
            if (r < 0 || r > 7 || c < 0 || c > 7) break;
            if (board[r][c]?.color === p.color) break;
            activity++;
            if (board[r][c] || p.type === "n") break;
          }
        score += activity * (p.type === "q" ? 1 : 3);
      }
      white += (p.color === "w" ? 1 : -1) * score;
    }
  if (advanced)
    for (const color of ["w", "b"] as const) {
      let score = 0;
      for (const [row, col] of pawns[color]) {
        if (pawns[color].filter((p) => p[1] === col).length > 1) score -= 12;
        if (!pawns[color].some((p) => Math.abs(p[1] - col) === 1)) score -= 15;
        if (
          !pawns[color === "w" ? "b" : "w"].some(
            ([r, c]) =>
              Math.abs(c - col) <= 1 && (color === "w" ? r < row : r > row),
          )
        )
          score += 18 + (color === "w" ? 6 - row : row - 1) ** 2 * 4;
      }
      const king = kings[color];
      if (king && !endgame) {
        for (const [r, c] of pawns[color])
          if (Math.abs(c - king[1]) <= 1 && Math.abs(r - king[0]) <= 2)
            score += 10;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const r = king[0] + dr,
              c = king[1] + dc;
            if (
              r >= 0 &&
              r < 8 &&
              c >= 0 &&
              c < 8 &&
              game.isAttacked(
                `${"abcdefgh"[c]}${8 - r}` as import("chess.js").Square,
                color === "w" ? "b" : "w",
              )
            )
              score -= 12;
          }
      }
      if (pieces.filter((p) => p.color === color && p.type === "b").length >= 2)
        score += 25;
      white += (color === "w" ? 1 : -1) * score;
    }
  // Search already generated these legal moves, including pins/check evasions.
  // Activity above estimates both sides; this tempo term rewards the current
  // side's real options without regenerating moves at every leaf.
  const legalMobility = simple ? 0 : (legalCount ?? game.moves().length) * 2;
  return (game.turn() === "w" ? 1 : -1) * Math.round(white) + legalMobility;
}
