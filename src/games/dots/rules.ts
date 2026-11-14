import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Dots and boxes on a square of boxes. Lines 0…: the horizontal ones row by
 * row, then the vertical ones. Whoever draws the fourth side of a box takes
 * it and draws again.
 */
export const sizeOf = (variant: string) => (variant === "3" ? 3 : variant === "7" ? 7 : 5);
export interface State {
  size: number;
  /** Who drew each line. */
  lines: (0 | 1 | null)[];
  boxes: (0 | 1 | null)[];
  turn: 0 | 1;
  ply: number;
  /** The line drawn last and the boxes it closed. */
  last: { line: number; closed: number[] } | null;
  effect: Effect | null;
  winner: Winner;
}
/** The four lines round a box. */
export function sides(size: number, box: number) {
  const r = Math.floor(box / size),
    c = box % size,
    vertical = size * (size + 1);
  return [r * size + c, (r + 1) * size + c, vertical + r * (size + 1) + c, vertical + r * (size + 1) + c + 1];
}
export const lineCount = (size: number) => 2 * size * (size + 1);
export function createGame(variant: string = "5"): State {
  const size = sizeOf(variant);
  return {
    size,
    lines: Array(lineCount(size)).fill(null),
    boxes: Array(size * size).fill(null),
    turn: 0,
    ply: 0,
    last: null,
    effect: null,
    winner: null,
  };
}
export const count = (state: State, player: 0 | 1) => state.boxes.filter((b) => b === player).length;
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : state.lines.flatMap((l, to) => (l === null ? [{ from: -1, to, extra: -1 }] : []));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || state.lines[move.to] !== null) return null;
  const me = state.turn,
    lines = state.lines.slice(),
    boxes = state.boxes.slice();
  lines[move.to] = me;
  const closed = boxes.flatMap((owner, box) =>
    owner === null && sides(state.size, box).includes(move.to) && sides(state.size, box).every((l) => lines[l] !== null) ? [box] : [],
  );
  for (const box of closed) boxes[box] = me;
  const full = lines.every((l) => l !== null),
    mine = boxes.filter((b) => b === 0).length,
    theirs = boxes.filter((b) => b === 1).length;
  return {
    size: state.size,
    lines,
    boxes,
    turn: closed.length ? me : me === 0 ? 1 : 0,
    ply: state.ply + 1,
    last: { line: move.to, closed },
    effect: { kind: "place", from: -1, to: move.to, converted: [], removed: [] },
    winner: full ? (mine === theirs ? "draw" : mine > theirs ? 0 : 1) : null,
  };
}
export const dots: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.lines,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate(s, player) {
    const other = player === 0 ? 1 : 0,
      // Boxes with three sides drawn go to whoever moves next.
      ready = s.boxes.filter((b, box) => b === null && sides(s.size, box).filter((l) => s.lines[l] !== null).length === 3).length;
    return (count(s, player) - count(s, other)) * 10 + (s.turn === player ? ready : -ready) * 8;
  },
  // Lines that give a box away are searched last.
  candidates(s) {
    const drawn = (box: number) => sides(s.size, box).filter((l) => s.lines[l] !== null).length,
      score = (line: number) => {
        let value = 0;
        s.boxes.forEach((b, box) => {
          if (b !== null || !sides(s.size, box).includes(line)) return;
          value += drawn(box) === 3 ? 10 : drawn(box) === 2 ? -5 : 0;
        });
        return value;
      };
    return moves(s).sort((a, b) => score(b.to) - score(a.to));
  },
  hint: () => "점과 점 사이에 선을 그으세요. 네모를 완성하면 한 번 더 긋습니다.",
  tally: (s) => [`네모 ${count(s, 0)}`, `네모 ${count(s, 1)}`],
  reason: (s) => `${count(s, 0)} : ${count(s, 1)}`,
};
