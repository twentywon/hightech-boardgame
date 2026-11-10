import {
  Chess,
  DEFAULT_POSITION,
  type Color,
  type Square,
  type Move,
  type PieceSymbol,
} from "chess.js";
export type { Color, Square, Move, PieceSymbol } from "chess.js";
export type Promotion = "q" | "r" | "b" | "n";
export interface Action {
  from: Square;
  to: Square;
  promotion?: Promotion;
}
export interface Outcome {
  winner: Color | null;
  reason: string;
}
export interface State {
  initialFen: string;
  moves: Action[];
  fen: string;
  outcome: Outcome | null;
}
export const other = (c: Color): Color => (c === "w" ? "b" : "w");
export const action = (m: Move): Action => ({
  from: m.from,
  to: m.to,
  ...(m.promotion ? { promotion: m.promotion as Promotion } : {}),
});
export const sameMove = (a: Action, b: Action) =>
  a.from === b.from && a.to === b.to && a.promotion === b.promotion;
// chess.js emits an en-passant square only when a LEGAL capture exists.
export const positionKey = (fen: string) =>
  new Chess(fen).fen().split(" ").slice(0, 4).join(" ");
export const halfmoves = (game: Chess) => Number(game.fen().split(" ")[4]);
export function createEngine(state: State): Chess {
  const game = new Chess(state.initialFen);
  for (const m of state.moves) game.move(m);
  return game;
}
export function repetitions(game: Chess): Map<string, number> {
  const history = game.history({ verbose: true });
  const keys = [
    history[0]?.before ?? game.fen(),
    ...history.map((m) => m.after),
  ];
  const counts = new Map<string, number>();
  for (const fen of keys) {
    const key = fen.split(" ").slice(0, 4).join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
export const currentKey = (game: Chess) =>
  game.fen().split(" ").slice(0, 4).join(" ");
export function automaticOutcome(game: Chess, count?: number): Outcome | null {
  if (game.isCheckmate())
    return { winner: other(game.turn()), reason: "체크메이트" };
  if (game.isStalemate()) return { winner: null, reason: "스테일메이트" };
  if (game.isInsufficientMaterial())
    return { winner: null, reason: "기물 부족" };
  if ((count ?? repetitions(game).get(currentKey(game)) ?? 0) >= 5)
    return { winner: null, reason: "5회 반복" };
  if (halfmoves(game) >= 150) return { winner: null, reason: "75수 규칙" };
  return null;
}
export function createGame(fen = DEFAULT_POSITION): State {
  const game = new Chess(fen);
  return {
    initialFen: game.fen(),
    moves: [],
    fen: game.fen(),
    outcome: automaticOutcome(game),
  };
}
export function legalMoves(state: State, square?: Square): Move[] {
  return state.outcome
    ? []
    : createEngine(state).moves({
        verbose: true,
        ...(square ? { square } : {}),
      });
}
export function play(state: State, move: Action): State | null {
  if (state.outcome) return null;
  try {
    const game = createEngine(state);
    const applied = game.move(move);
    return {
      ...state,
      moves: [...state.moves, action(applied)],
      fen: game.fen(),
      outcome: automaticOutcome(game),
    };
  } catch {
    return null;
  }
}
export function claimReasons(state: State, intended?: Action): string[] {
  if (state.outcome) return [];
  try {
    const game = createEngine(state);
    if (intended) game.move(intended);
    if (game.isCheckmate()) return [];
    const result: string[] = [];
    if ((repetitions(game).get(currentKey(game)) ?? 0) >= 3)
      result.push("3회 반복");
    if (halfmoves(game) >= 100) result.push("50수 규칙");
    return result;
  } catch {
    return [];
  }
}
export function claimDraw(state: State, intended?: Action): State | null {
  const reasons = claimReasons(state, intended);
  return reasons.length
    ? {
        ...state,
        outcome: {
          winner: null,
          reason: `${reasons.join(" · ")} 청구${intended ? " (예정 수 선언)" : ""}`,
        },
      }
    : null;
}
export function captures(state: State): Record<Color, PieceSymbol[]> {
  const result: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const m of createEngine(state).history({ verbose: true }))
    if (m.captured) result[m.color].push(m.captured);
  return result;
}
