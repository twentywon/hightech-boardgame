import {
  legalMoves,
  counts,
  other,
  rays,
  type Board,
  type Player,
} from "./rules";
export const corners = [0, 7, 56, 63];
const dangerous = [
  [0, [1, 8, 9]],
  [7, [6, 14, 15]],
  [56, [48, 49, 57]],
  [63, [54, 55, 62]],
] as const;
const weights = [
  120, 0, 16, 6, 6, 16, 0, 120, 0, 0, -4, -3, -3, -4, 0, 0, 16, -4, 12, 3, 3,
  12, -4, 16, 6, -3, 3, 2, 2, 3, -3, 6, 6, -3, 3, 2, 2, 3, -3, 6, 16, -4, 12, 3,
  3, 12, -4, 16, 0, 0, -4, -3, -3, -4, 0, 0, 120, 0, 16, 6, 6, 16, 0, 120,
];
const adjacent = rays.map((lines) =>
  lines.flatMap((ray) => (ray.length ? [ray[0]] : [])),
);
// Conservative lower bound: only uninterrupted edge chains anchored at a corner.
// Interior stable discs are deliberately not claimed as proven stable.
export function stableEdges(board: Board, player: Player): number {
  const stable = new Set<number>();
  for (const corner of corners)
    if (board[corner] === player) {
      stable.add(corner);
      for (const delta of corner === 0
        ? [1, 8]
        : corner === 7
          ? [-1, 8]
          : corner === 56
            ? [1, -8]
            : [-1, -8])
        for (let k = 1; k < 8; k++) {
          const i = corner + delta * k;
          if (board[i] !== player) break;
          stable.add(i);
        }
    }
  return stable.size;
}
export function oddRegions(board: Board): number {
  const seen = new Set<number>();
  let score = 0;
  for (let i = 0; i < 64; i++)
    if (!board[i] && !seen.has(i)) {
      let size = 0;
      const stack = [i];
      seen.add(i);
      while (stack.length) {
        const n = stack.pop()!;
        size++;
        const r = Math.floor(n / 8),
          c = n % 8;
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const rr = r + dr,
            cc = c + dc,
            j = rr * 8 + cc;
          if (
            rr >= 0 &&
            rr < 8 &&
            cc >= 0 &&
            cc < 8 &&
            !board[j] &&
            !seen.has(j)
          ) {
            seen.add(j);
            stack.push(j);
          }
        }
      }
      score += size % 2 ? 1 : -1;
    }
  return score;
}
export function positional(board: Board, player: Player): number {
  const opp = other(player);
  let score = 0;
  for (let i = 0; i < 64; i++)
    score +=
      board[i] === player ? weights[i] : board[i] === opp ? -weights[i] : 0;
  for (const [corner, near] of dangerous)
    if (!board[corner])
      for (const i of near) {
        const cost =
          Math.abs(Math.floor(i / 8) - Math.floor(corner / 8)) === 1 &&
          Math.abs((i % 8) - (corner % 8)) === 1
            ? 75
            : 35;
        score += board[i] === player ? -cost : board[i] === opp ? cost : 0;
      }
  return score;
}
export function evaluate(
  board: Board,
  player: Player,
  advanced: boolean,
): number {
  const opp = other(player),
    c = counts(board),
    diff = player === 1 ? c.black - c.white : c.white - c.black;
  const mobility =
    legalMoves(board, player).length - legalMoves(board, opp).length;
  const cornersDiff = corners.reduce(
    (n, i) => n + (board[i] === player ? 1 : board[i] === opp ? -1 : 0),
    0,
  );
  let frontier = 0,
    potential = 0,
    edges = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i]) {
      if (adjacent[i].some((j) => !board[j]))
        frontier += board[i] === player ? -1 : 1;
      if (i < 8 || i >= 56 || i % 8 === 0 || i % 8 === 7)
        edges += board[i] === player ? 1 : -1;
    } else if (advanced) {
      potential +=
        (adjacent[i].some((j) => board[j] === opp) ? 1 : 0) -
        (adjacent[i].some((j) => board[j] === player) ? 1 : 0);
    }
  }
  const late = c.empty <= 18;
  let result =
    positional(board, player) * 2 +
    cornersDiff * 350 +
    mobility * (late ? 6 : 24) +
    frontier * (late ? 3 : 12) +
    diff * (late ? 12 : c.empty > 44 ? -1 : 1) +
    edges * 3;
  if (advanced)
    result +=
      (stableEdges(board, player) - stableEdges(board, opp)) * 45 +
      potential * 7 +
      (late ? oddRegions(board) * 8 : 0);
  return result;
}
