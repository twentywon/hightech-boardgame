import type { Effect, Move, PointGame, Winner } from "../points/types";
import { sameMove } from "../points/types";

/**
 * 레이저 체스: two sides of mirrors, shields and a king on a board of ten columns by eight rows, each with a laser
 * fixed in its own corner. The pieces, their names and both starting positions are our own; only the kind of game
 * (laser chess, as it has been called since 1987) is shared with others.
 *
 * Cells are numbered row by row, `r * COLS + c`: row 0 is the far edge (the gold side's home), row 7 the near one
 * (the silver side's), column 0 the left as the silver side sees it. Directions are 0 north (toward row 0), 1 east,
 * 2 south and 3 west; a quarter turn clockwise, seen from above, adds one.
 *
 * A turn is one move (a piece one square in any of eight directions onto an empty square, a switch changing places
 * with a deflector or a shield next to it, or a piece turned a quarter), and then the mover's laser fires by itself.
 * The beam runs straight, turns at mirrors, and stops at the first thing it cannot pass: what it takes is taken off,
 * whoever it belongs to, and a king taken loses the game for its side, the mover's own included.
 *
 * A piece is one number: its kind times 8, plus 4 for the gold side, plus its facing (`piece`, `kindOf`, `sideOf`,
 * `dirOf`). A deflector faces two directions, `dir` and `dir + 1`: its mirror lies along the diagonal between them.
 * A switch's facing is 0 ("\": the mirror from the north-west corner to the south-east one) or 1 ("/"). A shield's
 * front faces `dir`; a laser fires toward `dir`.
 *
 * A move is `{ from, to, extra: -1 }`: `to` a cell for a step or a swap, or `TURN_LEFT` (a quarter turn against the
 * clock) or `TURN_RIGHT` for a turn.
 */
export const COLS = 10,
  ROWS = 8,
  CELLS = COLS * ROWS;
/** The two turns, as the points of the buttons over a piece picked up. */
export const TURN_LEFT = CELLS,
  TURN_RIGHT = CELLS + 1;
export const LASER = 1,
  KING = 2,
  DEFLECTOR = 3,
  SWITCH = 4,
  SHIELD = 5;
export type Kind = typeof LASER | typeof KING | typeof DEFLECTOR | typeof SWITCH | typeof SHIELD;
/** A game is drawn when this many moves have been made without a king being hit. */
export const LIMIT = 200;
export const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
/** The eight steps a piece may take, as row and column offsets. */
export const STEPS: [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
export const piece = (kind: Kind, side: 0 | 1, dir: number) => (kind << 3) | (side << 2) | (kind === SWITCH ? dir & 1 : dir & 3);
export const kindOf = (p: number) => (p >> 3) as Kind | 0;
export const sideOf = (p: number) => ((p >> 2) & 1) as 0 | 1;
export const dirOf = (p: number) => p & 3;
export const rowOf = (cell: number) => Math.floor(cell / COLS),
  colOf = (cell: number) => cell % COLS,
  cellOf = (r: number, c: number) => r * COLS + c;
/** The names of the two sides: silver (near, moves first) and gold (far). */
export const SIDES: [string, string] = ["은빛", "금빛"];
export const KIND_NAMES: Record<Kind, string> = { [LASER]: "레이저포", [KING]: "왕", [DEFLECTOR]: "반사경", [SWITCH]: "이중 반사경", [SHIELD]: "방패" };
/** Each side's laser, fixed in its own right-hand corner, and the two ways it may face. */
export const LASER_CELL: [number, number] = [cellOf(7, 9), cellOf(0, 0)];
export const LASER_FACINGS: [[number, number], [number, number]] = [
  [0, 3],
  [2, 1],
];
/**
 * Squares only one side's pieces may stand on: for each side the edge column its laser stands in and the square
 * beside its laser along its home row. The other side's pieces may neither step nor be swapped onto them.
 */
export const RESERVED: (0 | 1 | null)[] = Array.from({ length: CELLS }, (_, cell) => {
  const r = rowOf(cell),
    c = colOf(cell);
  if (c === COLS - 1 || (r === ROWS - 1 && c === COLS - 2)) return 0;
  if (c === 0 || (r === 0 && c === 1)) return 1;
  return null;
});
/** Whether `side` may stand on `cell`. */
export const allowed = (cell: number, side: 0 | 1) => RESERVED[cell] === null || RESERVED[cell] === side;

/**
 * The starting positions: the silver side's pieces as kind, row, column and facing; the gold side's are the same
 * turned half round the board (row 7 − r, column 9 − c, facing + 2), so the two sides start alike.
 *
 * Both keep the column next to their laser's (column 8 for silver) empty and set a deflector on the home row that
 * sends a laser turned along that row straight off the board, so that no first move of either side can make its
 * shot take anything: the laser fires up its own column, where only its own pieces may stand, and off the board.
 */
type Placing = [Kind, number, number, number];
export const SETUPS: Record<string, { label: string; note: string; pieces: Placing[] }> = {
  // The king in the middle of the home row between two shields, two switches before it, deflectors spread out.
  classic: {
    label: "기본",
    note: "왕을 방패와 이중 반사경으로 감싼 배치",
    pieces: [
      [LASER, 7, 9, 0],
      [KING, 7, 4, 0],
      [SHIELD, 7, 3, 0],
      [SHIELD, 7, 5, 0],
      [SWITCH, 6, 4, 0],
      [SWITCH, 6, 5, 1],
      [DEFLECTOR, 7, 7, 1],
      [DEFLECTOR, 7, 1, 2],
      [DEFLECTOR, 6, 2, 2],
      [DEFLECTOR, 6, 7, 3],
      [DEFLECTOR, 5, 1, 3],
      [DEFLECTOR, 4, 3, 0],
      [DEFLECTOR, 4, 6, 3],
    ],
  },
  // The king tucked into the left of the home row; switches and deflectors pushed up to the middle of the board.
  attack: {
    label: "공격형",
    note: "이중 반사경과 반사경을 앞으로 내민 배치",
    pieces: [
      [LASER, 7, 9, 0],
      [KING, 7, 2, 0],
      [SHIELD, 6, 2, 0],
      [SHIELD, 7, 3, 1],
      [SWITCH, 4, 4, 1],
      [SWITCH, 4, 6, 0],
      [DEFLECTOR, 7, 7, 1],
      [DEFLECTOR, 7, 1, 2],
      [DEFLECTOR, 6, 5, 0],
      [DEFLECTOR, 5, 3, 1],
      [DEFLECTOR, 5, 7, 3],
      [DEFLECTOR, 4, 2, 3],
      [DEFLECTOR, 4, 5, 2],
    ],
  },
};
export const VARIANTS = Object.keys(SETUPS);
export const setupOf = (variant: string) => SETUPS[variant] ?? SETUPS.classic;

/**
 * Where a shot went: the cells it crossed in order from its laser's own, how it ended (`off` out of the board,
 * `block` stopped by a shield's front or a laser, `take` the piece in its last cell taken), the way it was going
 * at the end, and the piece it took (0 for none).
 */
export interface Shot {
  side: 0 | 1;
  path: number[];
  end: "off" | "block" | "take";
  dir: number;
  taken: number;
}
export interface State {
  variant: string;
  board: number[];
  turn: 0 | 1;
  ply: number;
  winner: Winner;
  /** Every move made, for undo to play again. */
  history: Move[];
  /** The last turn: who made which move, the piece it moved or turned, and its shot. */
  last: { side: 0 | 1; move: Move; piece: number; shot: Shot } | null;
  /** The pieces each side has lost, in order. */
  lost: [number[], number[]];
}

/** The starting board of a variant. */
export function startBoard(variant: string): number[] {
  const board = Array<number>(CELLS).fill(0);
  for (const [kind, r, c, dir] of setupOf(variant).pieces) {
    board[cellOf(r, c)] = piece(kind, 0, dir);
    board[cellOf(ROWS - 1 - r, COLS - 1 - c)] = piece(kind, 1, dir + 2);
  }
  return board;
}
export function createGame(variant = "classic"): State {
  return { variant: SETUPS[variant] ? variant : "classic", board: startBoard(variant), turn: 0, ply: 0, winner: null, history: [], last: null, lost: [[], []] };
}
/**
 * The way a beam going `dir` leaves a mirror it enters, or -1 when it strikes the piece's plain side. `face` is the
 * mirror's first facing (a deflector's `dir`; a switch's, whose back is a mirror as well).
 */
export function reflect(kind: number, face: number, dir: number) {
  const from = (dir + 2) % 4,
    turn = (from - face + 4) % 4;
  if (turn === 0) return (face + 1) % 4;
  if (turn === 1) return face;
  if (kind !== SWITCH) return -1;
  return turn === 2 ? (face + 3) % 4 : (face + 2) % 4;
}
/**
 * What a beam does on meeting piece `p` while going `dir`: the way it goes on (0–3), or -1 when it is stopped and
 * nothing is taken, or -2 when the piece is taken.
 */
export function meet(p: number, dir: number) {
  const kind = kindOf(p);
  if (kind === LASER) return -1;
  if (kind === KING) return -2;
  if (kind === SHIELD) return dirOf(p) === (dir + 2) % 4 ? -1 : -2;
  const out = reflect(kind, dirOf(p), dir);
  return out < 0 ? -2 : out;
}
/** The shot of `side`'s laser on `board`. */
export function fire(board: ArrayLike<number>, side: 0 | 1): Shot {
  const start = LASER_CELL[side],
    path = [start];
  let dir = dirOf(board[start]),
    r = rowOf(start),
    c = colOf(start);
  // A beam can never come back to its laser without being stopped there, so it always ends; the bound is a guard.
  for (let step = 0; step < 4 * CELLS; step++) {
    r += DR[dir];
    c += DC[dir];
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return { side, path, end: "off", dir, taken: 0 };
    const cell = cellOf(r, c),
      p = board[cell];
    path.push(cell);
    if (!p) continue;
    const out = meet(p, dir);
    if (out === -1) return { side, path, end: "block", dir, taken: 0 };
    if (out === -2) return { side, path, end: "take", dir, taken: p };
    dir = out;
  }
  return { side, path, end: "block", dir, taken: 0 };
}
/** The way a laser turns from `dir` to its other facing. */
const laserTurn = (side: 0 | 1, dir: number) => {
  const other = LASER_FACINGS[side][0] === dir ? LASER_FACINGS[side][1] : LASER_FACINGS[side][0];
  return (dir + 1) % 4 === other ? TURN_RIGHT : TURN_LEFT;
};
/** Every legal move of the side to move. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [],
    side = state.turn,
    board = state.board;
  for (let from = 0; from < CELLS; from++) {
    const p = board[from];
    if (!p || sideOf(p) !== side) continue;
    const kind = kindOf(p);
    if (kind === LASER) {
      out.push({ from, to: laserTurn(side, dirOf(p)), extra: -1 });
      continue;
    }
    const r = rowOf(from),
      c = colOf(from);
    for (const [dr, dc] of STEPS) {
      const rr = r + dr,
        cc = c + dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      const to = cellOf(rr, cc),
        q = board[to];
      if (!allowed(to, side)) continue;
      if (!q) out.push({ from, to, extra: -1 });
      // A switch changes places with a deflector or a shield of either side, each landing where it may stand.
      else if (kind === SWITCH && (kindOf(q) === DEFLECTOR || kindOf(q) === SHIELD) && allowed(from, sideOf(q))) out.push({ from, to, extra: -1 });
    }
    if (kind !== KING) out.push({ from, to: TURN_LEFT, extra: -1 }, { from, to: TURN_RIGHT, extra: -1 });
  }
  return out;
}
/** The piece at `from` after turning it (`to` is `TURN_LEFT` or `TURN_RIGHT`). */
export function turned(p: number, to: number) {
  const kind = kindOf(p) as Kind,
    side = sideOf(p),
    dir = dirOf(p);
  if (kind === LASER) return piece(kind, side, LASER_FACINGS[side][0] === dir ? LASER_FACINGS[side][1] : LASER_FACINGS[side][0]);
  if (kind === SWITCH) return piece(kind, side, dir ^ 1);
  return piece(kind, side, dir + (to === TURN_RIGHT ? 1 : 3));
}
/** The board after a move, before the shot. */
export function moved(board: number[], move: Move) {
  const next = board.slice();
  if (move.to >= CELLS) next[move.from] = turned(board[move.from], move.to);
  else {
    next[move.to] = board[move.from];
    next[move.from] = board[move.to];
  }
  return next;
}
/** The state after `move` and the shot that follows it, or null when the move is not legal. */
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => sameMove(m, move))) return null;
  const side = state.turn,
    board = moved(state.board, move),
    shot = fire(board, side),
    lost: [number[], number[]] = [state.lost[0], state.lost[1]];
  let winner: Winner = null;
  if (shot.end === "take") {
    board[shot.path[shot.path.length - 1]] = 0;
    const owner = sideOf(shot.taken);
    lost[owner] = [...lost[owner], shot.taken];
    if (kindOf(shot.taken) === KING) winner = (1 - owner) as 0 | 1;
  }
  const ply = state.ply + 1;
  if (winner === null && ply >= LIMIT) winner = "draw";
  return {
    ...state,
    board,
    turn: (1 - side) as 0 | 1,
    ply,
    winner,
    history: [...state.history, move],
    last: { side, move, piece: state.board[move.from], shot },
    lost,
  };
}
/** The game one move back, rebuilt by playing its moves again from the start; the game itself when nothing was played. */
export function undo(state: State): State {
  if (!state.history.length) return state;
  let s = createGame(state.variant);
  for (const move of state.history.slice(0, -1)) s = play(s, move)!;
  return s;
}
/** The pieces of `side` still on the board, its laser left out. */
export const standing = (state: State, side: 0 | 1) => state.board.filter((p) => p && sideOf(p) === side && kindOf(p) !== LASER).length;
export const kingOf = (board: ArrayLike<number>, side: 0 | 1) => {
  for (let cell = 0; cell < CELLS; cell++) if (kindOf(board[cell]) === KING && sideOf(board[cell]) === side) return cell;
  return -1;
};
/** Why the game ended, in a sentence or two. */
export function reasonOf(state: State) {
  if (state.winner === null) return "";
  if (state.winner === "draw") return `${LIMIT}수가 지나도록 어느 왕도 맞지 않았습니다.`;
  const loser = (1 - state.winner) as 0 | 1,
    own = state.last?.side === loser;
  return own ? `${SIDES[loser]} 왕이 제 편 레이저에 맞았습니다.` : `${SIDES[loser]} 왕이 ${SIDES[state.winner]} 레이저에 맞았습니다.`;
}
export const laserChess: PointGame<State> = {
  create: (variant) => createGame(variant),
  moves,
  play: (s, m) => play(s, m),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board.map((p) => (p ? sideOf(p) : null)),
  effect: (): Effect | null => null,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: () => "말을 옮기거나 ↺ ↻로 돌리면 레이저가 발사됩니다.",
  tally: (s) => [`말 ${standing(s, 0)}개`, `말 ${standing(s, 1)}개`],
  reason: reasonOf,
};
