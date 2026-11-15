import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * The Royal Game of Ur, a race game from Mesopotamia, as reconstructed by
 * Irving Finkel. Each side brings seven pieces along a way of fourteen
 * squares: four down its own row, eight along the middle row they share,
 * two back along its own row, then off. Four tetrahedral dice, each with
 * two of its four tips marked, give 0 to 4. A piece landing on one of the
 * other side's in the middle row sends it back to the start; a piece on a
 * rosette earns another throw, and the middle rosette is safe.
 */
export const PIECES = 7,
  /** A piece's way: 0 waiting to start, 1–14 on the board, 15 off. */
  OFF = 15,
  ROSETTES = [4, 8, 14],
  /** The middle rosette, where a piece cannot be taken. */
  SAFE = 8,
  /** The point of the dice; pieces are points 0–6 (side 0) and 7–13 (side 1). */
  THROW = 20,
  DEST_BASE = 100;
/** Squares 5–12 lie in the middle row, shared by both sides. */
export const shared = (progress: number) => progress >= 5 && progress <= 12;
export interface State {
  pieces: [number[], number[]];
  turn: 0 | 1;
  phase: "throw" | "move";
  /** The four dice: whether each lies with a marked tip up. */
  dice: boolean[];
  winner: Winner;
  last: { side: 0 | 1; thrown: number; piece: number; from: number; to: number; sent: number[] } | null;
  ply: number;
}
export const createGame = (): State => ({ pieces: [Array(PIECES).fill(0), Array(PIECES).fill(0)], turn: 0, phase: "throw", dice: [false, true, false, true], winner: null, last: null, ply: 0 });
export const thrown = (state: Pick<State, "dice">) => state.dice.filter(Boolean).length;
/** Where a piece goes by `n`, or null when it cannot: past the end, or onto one of its own. */
function landing(state: State, side: 0 | 1, progress: number, n: number) {
  const to = progress + n;
  if (n === 0 || progress === OFF || to > OFF) return null;
  if (to < OFF && state.pieces[side].includes(to)) return null;
  // The other side's piece on the middle rosette cannot be landed on.
  const other = state.pieces[1 - side];
  if (to === SAFE && other.includes(SAFE)) return null;
  return to;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  if (state.phase === "throw") return [{ from: -1, to: THROW, extra: -1 }];
  const side = state.turn,
    n = thrown(state),
    out: Move[] = [],
    seen = new Set<number>();
  state.pieces[side].forEach((progress, k) => {
    const to = landing(state, side, progress, n);
    // Pieces waiting together at the start are one choice.
    if (to === null || seen.has(progress)) return;
    if (progress === 0) seen.add(0);
    out.push({ from: side * PIECES + k, to: DEST_BASE + to, extra: -1 });
  });
  return out;
}
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const me = state.turn,
    other = (1 - me) as 0 | 1;
  if (state.phase === "throw") {
    const dice = [0, 1, 2, 3].map(() => random() < 0.5),
      rolled: State = { ...state, dice, phase: "move", ply: state.ply + 1, last: { side: me, thrown: dice.filter(Boolean).length, piece: -1, from: 0, to: 0, sent: [] } };
    // Nothing can move (a throw of 0, or every way blocked): the dice pass on.
    return moves(rolled).length ? rolled : { ...rolled, phase: "throw", turn: other };
  }
  const k = move.from - me * PIECES,
    from = state.pieces[me][k],
    to = move.to - DEST_BASE,
    pieces: [number[], number[]] = [state.pieces[0].slice(), state.pieces[1].slice()],
    sent: number[] = [];
  pieces[me][k] = to;
  if (shared(to))
    pieces[other].forEach((progress, j) => {
      if (progress === to) {
        pieces[other][j] = 0;
        sent.push(other * PIECES + j);
      }
    });
  const won = pieces[me].every((p) => p === OFF),
    // A rosette earns another throw.
    again = ROSETTES.includes(to);
  return { ...state, pieces, phase: "throw", turn: won || again ? me : other, winner: won ? me : null, ply: state.ply + 1, last: { side: me, thrown: thrown(state), piece: move.from, from, to, sent } };
}
/** The computer's choice of piece: it takes, rests on rosettes, bears off and keeps clear of danger, in that order of liking. */
export function choosePiece(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (legal.length <= 1 || (level === "easy" && random() < 0.5)) return legal[Math.floor(random() * legal.length)] ?? null;
  const me = state.turn,
    other = (1 - me) as 0 | 1,
    // The chance that the other side throws exactly 1–4 to reach a middle square from behind it.
    odds = [0, 4 / 16, 6 / 16, 4 / 16, 1 / 16],
    danger = (progress: number) =>
      !shared(progress) || progress === SAFE ? 0 : state.pieces[other].reduce((n, p) => n + (p < progress && progress - p <= 4 ? odds[progress - p] : 0), 0);
  let best = legal[0],
    top = -Infinity;
  for (const move of legal) {
    const next = play(state, move)!,
      from = state.pieces[me][move.from - me * PIECES],
      to = move.to - DEST_BASE,
      score =
        next.last!.sent.length * 40 +
        (ROSETTES.includes(to) ? 30 : 0) +
        (to === OFF ? 18 : 0) +
        (from === 0 ? 6 : 0) +
        danger(from) * 30 -
        danger(to) * (level === "hard" ? 40 : 22) +
        (from === SAFE ? -12 : 0) +
        to * 0.3 +
        random() * 0.5;
    if (score > top) {
      top = score;
      best = move;
    }
  }
  return best;
}
const effect = (state: State): Effect | null =>
  state.last && state.last.piece >= 0 ? { kind: "move", from: state.last.piece, to: state.last.piece, converted: [], removed: state.last.sent } : null;
export const ur: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: (state, level, random) => (state.phase === "throw" ? { from: -1, to: THROW, extra: -1 } : choosePiece(state, level, random)),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [...Array(PIECES).fill(0), ...Array(PIECES).fill(1)],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.pieces[player].reduce((n, p) => n + p, 0) - s.pieces[1 - player].reduce((n, p) => n + p, 0),
  hint: (s) =>
    s.phase === "throw"
      ? s.last && s.last.piece < 0 && s.last.side !== s.turn
        ? `상대가 ${s.last.thrown}이(가) 나와 움직일 말이 없었습니다. 주사위를 던지세요.`
        : "주사위를 던지세요."
      : `${thrown(s)}이(가) 나왔습니다. 움직일 말을 고르세요.`,
  tally: (s) => [0, 1].map((p) => `나간 말 ${s.pieces[p].filter((t) => t === OFF).length} / ${PIECES}`) as [string, string],
  reason: () => "말 일곱 개를 모두 판 밖으로 내보냈습니다.",
};
