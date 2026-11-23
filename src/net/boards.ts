import type { Move } from "../games/points/types";
import * as chess from "../games/chess/rules";
import * as gomoku from "../games/gomoku/rules";
import * as reversi from "../games/reversi/rules";
import * as janggi from "../games/janggi/rules";
import { NOBODY, type NetRules } from "./match";
import type { SeatKind } from "./protocol";

/**
 * The four games with their own screens (chess, gomoku, Reversi, janggi) as a room plays them (와이파이 여럿이,
 * stage 1b): two seats, seat 0 the side that moves first, either seat a person's or the host's computer. Each move
 * travels as the room's `{from, to, extra}` and is played through the game's own `play` in its `rules.ts` on every
 * device, so the host's legality check is the rules' own; an undo is the room's (the match replays its list).
 */
export interface BoardNet<S> extends NetRules<S> {
  /** The room's name of the game (its catalog id). */
  readonly game: string;
  /** The two seats, the first to move first. */
  readonly seats: { label: string; color: string; kinds: SeatKind[] }[];
  /** The seat that won, "draw", or null while the game goes on. */
  result(state: S): number | "draw" | null;
}
const COMPUTER: SeatKind[] = ["computer"];
const two = (labels: [string, string], colors: [string, string]) => labels.map((label, i) => ({ label, color: colors[i], kinds: COMPUTER }));
/** A board index in range, or null. */
const cell = (n: number, size: number) => (Number.isInteger(n) && n >= 0 && n < size ? n : null);

// ─────────────── Chess ───────────────
const FILES = "abcdefgh";
const PROMOTIONS: (chess.Promotion | undefined)[] = [undefined, "q", "r", "b", "n"];
/** `extra` of a chess move: the promotion (0 none, 1–4 q r b n), plus `CLAIM` for a draw claim. */
export const CLAIM = 8;
export const squareIndex = (square: chess.Square) => square.charCodeAt(0) - 97 + 8 * (Number(square[1]) - 1);
export const squareAt = (index: number) => `${FILES[index % 8]}${Math.floor(index / 8) + 1}` as chess.Square;
/** A chess move as a room sends it; a draw claim with `claim` (`action` the declared move, or null for the position). */
export function chessMove(action: chess.Action | null, claim = false): Move {
  const promotion = action?.promotion ? PROMOTIONS.indexOf(action.promotion) : 0;
  return action
    ? { from: squareIndex(action.from), to: squareIndex(action.to), extra: promotion + (claim ? CLAIM : 0) }
    : { from: -1, to: -1, extra: claim ? CLAIM : 0 };
}
/** A room's move read back as chess: the move (null for none) and whether it claims a draw; null if malformed. */
export function chessAction(move: Move): { action: chess.Action | null; claim: boolean } | null {
  const claim = move.extra >= CLAIM,
    promotion = move.extra - (claim ? CLAIM : 0);
  if (promotion < 0 || promotion >= PROMOTIONS.length) return null;
  if (move.from === -1 && move.to === -1) return claim && !promotion ? { action: null, claim } : null;
  const from = cell(move.from, 64),
    to = cell(move.to, 64);
  if (from === null || to === null) return null;
  const p = PROMOTIONS[promotion];
  return { action: { from: squareAt(from), to: squareAt(to), ...(p ? { promotion: p } : {}) }, claim };
}
export const chessNet: BoardNet<chess.State> = {
  game: "chess",
  seats: two(["백", "흑"], ["#f1ece0", "#1d1b19"]),
  create: () => chess.createGame(),
  play(state, move) {
    const read = chessAction(move);
    if (!read) return null;
    if (read.claim) return chess.claimDraw(state, read.action ?? undefined);
    return read.action ? chess.play(state, read.action) : null;
  },
  toMove: (s) => (s.outcome ? NOBODY : chess.createEngine(s).turn() === "w" ? 0 : 1),
  result: (s) => (!s.outcome ? null : s.outcome.winner === null ? "draw" : s.outcome.winner === "w" ? 0 : 1),
};

// ─────────────── Gomoku ───────────────
/** A stone as a room sends it: the point's index, row by row. */
export const gomokuMove = (p: gomoku.Point): Move => ({ from: -1, to: p.row * gomoku.SIZE + p.col, extra: -1 });
export const gomokuNet: BoardNet<gomoku.State> = {
  game: "gomoku",
  seats: two(["흑돌", "백돌"], ["#16181a", "#efe7d6"]),
  // 삼삼 is the host's choice, agreed at the start.
  create: (start) => gomoku.createGame(!!start.options.noDoubleThree),
  play(state, move) {
    const to = cell(move.to, gomoku.SIZE * gomoku.SIZE);
    if (to === null || move.from !== -1) return null;
    return gomoku.play(state, { row: Math.floor(to / gomoku.SIZE), col: to % gomoku.SIZE });
  },
  toMove: (s) => (s.winner !== null ? NOBODY : s.turn - 1),
  result: (s) => (s.winner === null ? null : s.winner === "draw" ? "draw" : s.winner - 1),
};

// ─────────────── Reversi ───────────────
/** A disc as a room sends it; passes are automatic and never sent. */
export const reversiMove = (p: reversi.Point): Move => ({ from: -1, to: reversi.indexOf(p), extra: -1 });
export const reversiNet: BoardNet<reversi.State> = {
  game: "reversi",
  seats: two(["흑돌", "백돌"], ["#16181a", "#efe7d6"]),
  create: () => reversi.createGame(),
  play(state, move) {
    const to = cell(move.to, 64);
    return to === null || move.from !== -1 ? null : reversi.play(state, reversi.point(to));
  },
  toMove: (s) => (s.winner !== null ? NOBODY : s.turn - 1),
  result: (s) => (s.winner === null ? null : s.winner === "draw" ? "draw" : s.winner - 1),
};

// ─────────────── Janggi ───────────────
/**
 * Janggi over Wi-Fi: each side's formation is chosen on that side's own device (as each chooses at one screen), so a
 * game begins with two formation moves, 초's then 한's, each sent by its device at once from its setup (the host's
 * computer picks for its seat). Until both are in, `game` shows the board with the choices so far.
 */
export interface JanggiRoom {
  picks: janggi.Formation[];
  game: janggi.State;
}
/** `from` of a formation move (`to` is its index in `FORMATIONS`) and of a pass (`to` -1). */
export const FORMATION = -2,
  PASS = -1;
export const formationMove = (f: janggi.Formation): Move => ({ from: FORMATION, to: janggi.FORMATIONS.indexOf(f), extra: -1 });
export const janggiMove = (move: janggi.Move | null): Move => (move ? { from: move.from, to: move.to, extra: -1 } : { from: PASS, to: -1, extra: -1 });
/** Whether the formations are still being chosen. */
export const choosing = (s: JanggiRoom) => s.picks.length < 2;
const laid = (picks: janggi.Formation[]) => janggi.createGame(picks[0], picks[1]);
export const janggiNet: BoardNet<JanggiRoom> = {
  game: "janggi",
  seats: two(["초", "한"], ["#1f7a5c", "#c0362c"]),
  create: () => ({ picks: [], game: laid([]) }),
  play(state, move) {
    if (choosing(state)) {
      const f = move.from === FORMATION ? janggi.FORMATIONS[move.to] : undefined;
      if (!f) return null;
      const picks = [...state.picks, f];
      return { picks, game: laid(picks) };
    }
    if (move.from === PASS && move.to === -1) {
      const game = janggi.play(state.game, null);
      return game && { picks: state.picks, game };
    }
    const from = cell(move.from, 90),
      to = cell(move.to, 90);
    if (from === null || to === null) return null;
    const game = janggi.play(state.game, { from, to });
    return game && { picks: state.picks, game };
  },
  toMove: (s) => (choosing(s) ? s.picks.length : s.game.outcome ? NOBODY : s.game.turn === "cho" ? 0 : 1),
  // A formation stands once chosen: an undo stops at the first move of the game.
  firm: (move) => move.from === FORMATION,
  result: (s) => (!s.game.outcome ? null : s.game.outcome.winner === null ? "draw" : s.game.outcome.winner === "cho" ? 0 : 1),
};
