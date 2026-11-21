/**
 * Janggi (Korean chess) on a 9 × 10 board of intersections.
 * Squares are numbered row by row from Han's back rank: index = y * 9 + x,
 * x 0–8 from Cho's left, y 0 (Han's back rank) to 9 (Cho's back rank).
 */
export const FILES = 9;
export const RANKS = 10;
export type Side = "cho" | "han";
export type Kind = "K" | "A" | "R" | "C" | "N" | "E" | "P";
/** How the horses and elephants start, read from the player's own left. */
export type Formation = "NENE" | "ENEN" | "NEEN" | "ENNE";
export const FORMATIONS: Formation[] = ["NENE", "ENEN", "NEEN", "ENNE"];
export interface Move {
  from: number;
  to: number;
}
export interface Outcome {
  winner: Side | null;
  reason: string;
}
export interface State {
  /** 90 characters: "." empty, upper case Cho, lower case Han. */
  board: string;
  turn: Side;
  /** Moves so far; null is a pass. */
  moves: (Move | null)[];
  initial: string;
  /** Position after each move, for the repetition rule. */
  keys: string[];
  /** The side that made the kings face each other on the previous move. */
  bikjang: Side | null;
  outcome: Outcome | null;
}
export const VALUE: Record<Kind, number> = { K: 0, R: 13, C: 7, N: 5, E: 3, A: 3, P: 2 };
/** Han moves second and receives this many points at a count. */
export const HAN_BONUS = 1.5;
export const MOVE_LIMIT = 200;
export const other = (side: Side): Side => (side === "cho" ? "han" : "cho");
export const sideOf = (piece: string): Side | null =>
  piece === "." ? null : piece === piece.toUpperCase() ? "cho" : "han";
export const kindOf = (piece: string) => piece.toUpperCase() as Kind;
export const at = (x: number, y: number) => y * FILES + x;
export const xOf = (i: number) => i % FILES;
export const yOf = (i: number) => Math.floor(i / FILES);
const inside = (x: number, y: number) => x >= 0 && x < FILES && y >= 0 && y < RANKS;
const inPalace = (x: number, y: number) =>
  x >= 3 && x <= 5 && ((y >= 0 && y <= 2) || (y >= 7 && y <= 9));
/** Palace points that lie on its diagonals: the corners and the centre. */
const onDiagonal = (x: number, y: number) =>
  inPalace(x, y) && (x === 4) === (y === 1 || y === 8);
const ORTHOGONAL = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;
const DIAGONAL = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

export function createGame(cho: Formation = "NENE", han: Formation = "NENE"): State {
  const cells = Array<string>(FILES * RANKS).fill(".");
  const place = (side: Side, formation: Formation) => {
    // `back` is the side's own back rank; ranks count toward the middle.
    const back = side === "cho" ? 9 : 0,
      step = side === "cho" ? -1 : 1,
      // A formation is read from the player's left, which for Han is file 8.
      file = (n: number) => (side === "cho" ? n : 8 - n),
      put = (n: number, rank: number, kind: string) =>
        (cells[at(file(n), back + step * rank)] = side === "cho" ? kind : kind.toLowerCase());
    put(0, 0, "R");
    put(8, 0, "R");
    put(3, 0, "A");
    put(5, 0, "A");
    put(4, 1, "K");
    put(1, 2, "C");
    put(7, 2, "C");
    for (const n of [0, 2, 4, 6, 8]) put(n, 3, "P");
    [1, 2, 6, 7].forEach((n, i) => put(n, 0, formation[i]));
  };
  place("cho", cho);
  place("han", han);
  const board = cells.join("");
  return {
    board,
    turn: "cho",
    moves: [],
    initial: board,
    keys: [board + "c"],
    bikjang: null,
    outcome: null,
  };
}

/**
 * Every move of `side` that follows the piece rules, ignoring whether its own
 * king is left attacked. `cells` is the board as an array of characters.
 */
export function pseudoMoves(cells: readonly string[], side: Side, only = -1): Move[] {
  const moves: Move[] = [];
  const mine = (x: number, y: number) => sideOf(cells[at(x, y)]) === side;
  const empty = (x: number, y: number) => cells[at(x, y)] === ".";
  for (let from = 0; from < cells.length; from++) {
    if (only >= 0 && from !== only) continue;
    const piece = cells[from];
    if (sideOf(piece) !== side) continue;
    const x = xOf(from),
      y = yOf(from),
      kind = kindOf(piece),
      add = (tx: number, ty: number) => moves.push({ from, to: at(tx, ty) });
    if (kind === "K" || kind === "A") {
      for (const [dx, dy] of ORTHOGONAL)
        if (inPalace(x + dx, y + dy) && !mine(x + dx, y + dy)) add(x + dx, y + dy);
      if (onDiagonal(x, y))
        for (const [dx, dy] of DIAGONAL)
          if (onDiagonal(x + dx, y + dy) && !mine(x + dx, y + dy)) add(x + dx, y + dy);
    } else if (kind === "P") {
      const forward = side === "cho" ? -1 : 1;
      for (const [dx, dy] of [
        [0, forward],
        [-1, 0],
        [1, 0],
      ])
        if (inside(x + dx, y + dy) && !mine(x + dx, y + dy)) add(x + dx, y + dy);
      if (onDiagonal(x, y))
        for (const dx of [-1, 1])
          if (onDiagonal(x + dx, y + forward) && !mine(x + dx, y + forward)) add(x + dx, y + forward);
    } else if (kind === "N" || kind === "E") {
      for (const [dx, dy] of ORTHOGONAL) {
        if (!inside(x + dx, y + dy) || !empty(x + dx, y + dy)) continue;
        // One step straight, then one (horse) or two (elephant) steps diagonally outward.
        for (const turn of [-1, 1]) {
          const sx = dx === 0 ? turn : dx,
            sy = dy === 0 ? turn : dy;
          let cx = x + dx + sx,
            cy = y + dy + sy;
          if (kind === "E") {
            if (!inside(cx, cy) || !empty(cx, cy)) continue;
            cx += sx;
            cy += sy;
          }
          if (inside(cx, cy) && !mine(cx, cy)) add(cx, cy);
        }
      }
    } else {
      // Chariots slide; cannons need exactly one piece to jump, never a cannon,
      // and never capture a cannon. Both also run along palace diagonals.
      const lines = [...ORTHOGONAL, ...(onDiagonal(x, y) ? DIAGONAL : [])];
      for (const [dx, dy] of lines) {
        const diagonal = dx !== 0 && dy !== 0;
        let cx = x + dx,
          cy = y + dy,
          jumped = false;
        while (inside(cx, cy) && (!diagonal || onDiagonal(cx, cy))) {
          const target = cells[at(cx, cy)];
          if (kind === "R") {
            if (target === ".") add(cx, cy);
            else {
              if (sideOf(target) !== side) add(cx, cy);
              break;
            }
          } else if (!jumped) {
            if (target !== ".") {
              if (kindOf(target) === "C") break;
              jumped = true;
            }
          } else if (target === ".") add(cx, cy);
          else {
            if (sideOf(target) !== side && kindOf(target) !== "C") add(cx, cy);
            break;
          }
          cx += dx;
          cy += dy;
        }
      }
    }
  }
  return moves;
}
const kingOf = (cells: readonly string[], side: Side) =>
  cells.indexOf(side === "cho" ? "K" : "k");
/** `side`'s king can be captured on the next move. */
export function attacked(cells: readonly string[], side: Side) {
  const king = kingOf(cells, side);
  return pseudoMoves(cells, other(side)).some((m) => m.to === king);
}
function applied(cells: readonly string[], move: Move) {
  const next = cells.slice();
  next[move.to] = next[move.from];
  next[move.from] = ".";
  return next;
}
/** The kings stand on one file with nothing between them. */
export function facing(cells: readonly string[]) {
  const a = kingOf(cells, "han"),
    b = kingOf(cells, "cho");
  if (a < 0 || b < 0 || xOf(a) !== xOf(b)) return false;
  for (let i = a + FILES; i < b; i += FILES) if (cells[i] !== ".") return false;
  return true;
}
/** Moves of the side to move that do not leave its own king attacked. */
export function legalMoves(state: State, from = -1): Move[] {
  if (state.outcome) return [];
  const cells = [...state.board];
  return pseudoMoves(cells, state.turn, from).filter(
    (m) => !attacked(applied(cells, m), state.turn),
  );
}
export const inCheck = (state: State) => attacked([...state.board], state.turn);
/** A pass is allowed whenever the side to move is not in check. */
export const canPass = (state: State) => !state.outcome && !inCheck(state);
/** Points of the pieces on the board; Han's include its bonus. */
export function points(board: string) {
  let cho = 0,
    han = HAN_BONUS;
  for (const piece of board)
    if (piece !== ".") {
      if (sideOf(piece) === "cho") cho += VALUE[kindOf(piece)];
      else han += VALUE[kindOf(piece)];
    }
  return { cho, han };
}
const count = (board: string, reason: string): Outcome => {
  const p = points(board);
  return { winner: p.cho > p.han ? "cho" : "han", reason: `${reason} — 점수 ${p.cho} : ${p.han}` };
};
/** Plays a move, or a pass for null. Returns null when it is not allowed. */
export function play(state: State, move: Move | null): State | null {
  if (state.outcome) return null;
  const cells = [...state.board],
    mover = state.turn,
    rival = other(mover);
  if (move === null) {
    if (!canPass(state)) return null;
  } else {
    if (!legalMoves(state, move.from).some((m) => m.to === move.to)) return null;
    cells[move.to] = cells[move.from];
    cells[move.from] = ".";
  }
  const board = cells.join(""),
    key = board + rival[0],
    keys = [...state.keys, key],
    moves = [...state.moves, move && { from: move.from, to: move.to }],
    next: State = { ...state, board, turn: rival, moves, keys, bikjang: null, outcome: null };
  const stuck =
    !pseudoMoves(cells, rival).some((m) => !attacked(applied(cells, m), rival));
  if (stuck && attacked(cells, rival)) next.outcome = { winner: mover, reason: "외통" };
  else if (facing(cells)) {
    // Facing kings must be broken by the reply, or the game is drawn.
    if (state.bikjang === rival) next.outcome = { winner: null, reason: "빅장" };
    else next.bikjang = mover;
  }
  if (!next.outcome) {
    if (keys.filter((k) => k === key).length >= 3)
      next.outcome = { winner: null, reason: "같은 국면 3회 반복" };
    else if (move === null && state.moves.length > 0 && state.moves.at(-1) === null)
      next.outcome = count(board, "양쪽 한수쉼");
    else if (moves.length >= MOVE_LIMIT) next.outcome = count(board, `${MOVE_LIMIT}수 도달`);
  }
  return next;
}
/** Returns the state with the last `count` moves removed, rebuilt by legal replay. */
export function undo(state: State, count = 1): State | null {
  if (!Number.isInteger(count) || count < 1 || count > state.moves.length) return null;
  let next: State = {
    board: state.initial,
    turn: "cho",
    moves: [],
    initial: state.initial,
    keys: [state.initial + "c"],
    bikjang: null,
    outcome: null,
  };
  for (const move of state.moves.slice(0, state.moves.length - count)) {
    const replayed = play(next, move);
    if (!replayed) return null;
    next = replayed;
  }
  return next;
}
export const NAMES: Record<Side, Record<Kind, string>> = {
  cho: { K: "초", A: "사", R: "차", C: "포", N: "마", E: "상", P: "졸" },
  han: { K: "한", A: "사", R: "차", C: "포", N: "마", E: "상", P: "병" },
};
/** "차 91→71": piece name with rank (1–10 from Han's side, 10 written 0) and file (1–9). */
export function describe(board: string, move: Move | null, side: Side) {
  if (!move) return "한수쉼";
  const square = (i: number) => `${(yOf(i) + 1) % 10}${xOf(i) + 1}`;
  return `${NAMES[side][kindOf(board[move.from])]} ${square(move.from)}→${square(move.to)}`;
}
