import type { Player } from "../rules";
export type Board = Int8Array;
export interface Threat {
  five: number;
  openFour: number;
  closedFour: number;
  openThree: number;
  closedThree: number;
  openTwo: number;
  multiple: number;
}
const directions = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];
// Analyze a hypothetical move without modifying the board. Only patterns containing
// this intersection count. Window analysis also catches split fours and broken threes.
export function analyze(board: Board, index: number, player: Player): Threat {
  const out: Threat = {
    five: 0,
    openFour: 0,
    closedFour: 0,
    openThree: 0,
    closedThree: 0,
    openTwo: 0,
    multiple: 0,
  };
  const row = Math.floor(index / 15),
    col = index % 15;
  for (const [dr, dc] of directions) {
    const line: number[] = [];
    for (let k = -5; k <= 5; k++) {
      const r = row + dr * k,
        c = col + dc * k;
      line.push(
        k === 0
          ? 1
          : r < 0 || c < 0 || r >= 15 || c >= 15
            ? 2
            : board[r * 15 + c] === player
              ? 1
              : board[r * 15 + c] === 0
                ? 0
                : 2,
      );
    }
    let left = 5,
      right = 5;
    while (left > 0 && line[left - 1] === 1) left--;
    while (right < 10 && line[right + 1] === 1) right++;
    if (right - left + 1 >= 5) {
      out.five++;
      continue;
    }
    const ends = new Set<number>();
    let three = false,
      two = false;
    for (let start = 1; start <= 5; start++) {
      let own = 0,
        zero = -1,
        blocked = false;
      for (let i = start; i < start + 5; i++) {
        if (line[i] === 2) blocked = true;
        if (line[i] === 1) own++;
        else if (line[i] === 0) zero = i;
      }
      if (!blocked && own === 4) ends.add(zero);
      if (!blocked && own === 3) three = true;
    }
    if (ends.size >= 2) {
      out.openFour++;
      continue;
    }
    if (ends.size === 1) {
      out.closedFour++;
      continue;
    }
    let openThree = false;
    for (let length = 5; length <= 6; length++)
      for (let start = 0; start + length <= 11; start++) {
        const end = start + length - 1;
        if (start >= 5 || end <= 5 || line[start] !== 0 || line[end] !== 0)
          continue;
        const inner = line.slice(start + 1, end);
        if (inner.includes(2)) continue;
        const own = inner.filter((v) => v === 1).length;
        if (own === 3) openThree = true;
        if (own === 2) two = true;
      }
    if (openThree) out.openThree++;
    else if (three) out.closedThree++;
    else if (two) out.openTwo++;
  }
  const threats = out.openFour + out.closedFour + out.openThree;
  out.multiple = threats >= 2 ? threats : 0;
  return out;
}
export function patternScore(t: Threat, advanced = true): number {
  return (
    t.five * 10_000_000 +
    t.openFour * 150_000 +
    t.closedFour * 16_000 +
    t.openThree * 4_000 +
    t.closedThree * 300 +
    t.openTwo * 80 +
    (advanced && t.multiple
      ? (t.closedFour + t.openFour ? 60_000 : 18_000) * t.multiple
      : 0)
  );
}
export interface Candidate {
  index: number;
  attack: Threat;
  defense: Threat;
  score: number;
}
export function candidates(board: Board): number[] {
  const found = new Set<number>();
  let occupied = false;
  for (let i = 0; i < 225; i++)
    if (board[i]) {
      occupied = true;
      const r = Math.floor(i / 15),
        c = i % 15;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr,
            cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < 15 && cc < 15 && !board[rr * 15 + cc])
            found.add(rr * 15 + cc);
        }
    }
  return occupied ? [...found].sort((a, b) => a - b) : [112];
}
export function rank(
  board: Board,
  player: Player,
  defense = 1.1,
  advanced = true,
  check = () => {},
): Candidate[] {
  const other = player === 1 ? 2 : 1;
  return candidates(board)
    .map((index, i) => {
      if (i % 8 === 0) check();
      const attack = analyze(board, index, player),
        defend = analyze(board, index, other);
      return {
        index,
        attack,
        defense: defend,
        score:
          patternScore(attack, advanced) +
          defense * patternScore(defend, advanced) +
          14 -
          Math.abs(Math.floor(index / 15) - 7) -
          Math.abs((index % 15) - 7),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
