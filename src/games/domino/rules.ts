import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Dominoes, the draw game with a double-six set: seven tiles each, the rest
 * face down. A tile is laid at either end of the line when one of its halves
 * matches that end; who cannot lay draws until one fits, or passes when the
 * pile is empty. Out first wins; when nobody can move, the fewer pips win.
 */
export const TILES: [number, number][] = [];
for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) TILES.push([a, b]);
/** Points after the 28 tiles: the two ends of the line, the pile, and passing. */
export const LEFT = 28,
  RIGHT = 29,
  DRAW = 30,
  PASS = 31;
export interface Laid {
  tile: number;
  /** The halves as they lie, left to right. */
  left: number;
  right: number;
}
export interface State {
  hands: [number[], number[]];
  stock: number[];
  line: Laid[];
  turn: 0 | 1;
  winner: Winner;
  /** Passes in a row. */
  passes: number;
  last: { tile: number; end: number } | { drew: true } | { passed: true } | null;
  ply: number;
}
export const pips = (tiles: number[]) => tiles.reduce((n, t) => n + TILES[t][0] + TILES[t][1], 0);
export function createGame(random: Random = cryptoRandom): State {
  const stock = TILES.map((_, i) => i);
  for (let i = stock.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [stock[i], stock[j]] = [stock[j], stock[i]];
  }
  return { hands: [stock.splice(0, 7), stock.splice(0, 7)], stock, line: [], turn: 0, winner: null, passes: 0, last: null, ply: 0 };
}
/** The numbers open at the two ends, or null before the first tile. */
export const ends = (state: State) => (state.line.length ? [state.line[0].left, state.line[state.line.length - 1].right] : null);
/** The ends a tile may be laid at. */
export function fits(state: State, tile: number) {
  const open = ends(state),
    [a, b] = TILES[tile];
  if (!open) return [RIGHT];
  return [LEFT, RIGHT].filter((end) => a === open[end - LEFT] || b === open[end - LEFT]);
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = state.hands[state.turn].flatMap((tile) => fits(state, tile).map((to) => ({ from: tile, to, extra: -1 })));
  if (out.length) return out;
  return [{ from: -1, to: state.stock.length ? DRAW : PASS, extra: -1 }];
}
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => m.from === move.from && m.to === move.to) || move.extra !== -1) return null;
  const me = state.turn,
    other = (me ? 0 : 1) as 0 | 1,
    hands: [number[], number[]] = [state.hands[0].slice(), state.hands[1].slice()],
    next: State = { ...state, hands, ply: state.ply + 1 };
  if (move.to === DRAW) {
    // The drawer keeps the turn: it lays the tile if it fits, or draws again.
    next.stock = state.stock.slice();
    hands[me].push(next.stock.pop()!);
    next.last = { drew: true };
    return next;
  }
  if (move.to === PASS) {
    next.passes = state.passes + 1;
    next.turn = other;
    next.last = { passed: true };
    if (next.passes >= 2) {
      const mine = pips(hands[0]),
        theirs = pips(hands[1]);
      next.winner = mine === theirs ? "draw" : mine < theirs ? 0 : 1;
    }
    return next;
  }
  const [a, b] = TILES[move.from],
    open = ends(state),
    line = state.line.slice();
  if (!open) line.push({ tile: move.from, left: a, right: b });
  else if (move.to === LEFT) line.unshift(a === open[0] ? { tile: move.from, left: b, right: a } : { tile: move.from, left: a, right: b });
  else line.push(a === open[1] ? { tile: move.from, left: a, right: b } : { tile: move.from, left: b, right: a });
  hands[me] = hands[me].filter((t) => t !== move.from);
  next.line = line;
  next.passes = 0;
  next.turn = other;
  next.last = { tile: move.from, end: move.to };
  if (!hands[me].length) next.winner = me;
  return next;
}
/**
 * The computer's move, from its own hand and the line alone. It lays its
 * heaviest tile; the stronger levels would rather leave ends it can follow.
 */
export function chooseTile(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (!legal.length) return null;
  if (legal[0].from === -1) return legal[0];
  if (level === "easy" && random() < 0.5) return legal[Math.floor(random() * legal.length)];
  const hand = state.hands[state.turn];
  let best = legal[0],
    top = -Infinity;
  for (const move of legal) {
    const [a, b] = TILES[move.from],
      after = play(state, move)!,
      open = ends(after)!,
      rest = hand.filter((t) => t !== move.from),
      // Tiles left that could follow either new end.
      follow = rest.filter((t) => open.includes(TILES[t][0]) || open.includes(TILES[t][1])).length,
      score = a + b + (a === b ? 4 : 0) + (level === "easy" ? 0 : follow * (level === "hard" ? 5 : 2)) + random() * 0.5;
    if (score > top) {
      top = score;
      best = move;
    }
  }
  return best;
}
const effect = (state: State): Effect | null =>
  state.last && "tile" in state.last ? { kind: "place", from: state.last.tile, to: state.last.end, converted: [], removed: [] } : null;
export const domino: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseTile,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => Array(32).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => pips(s.hands[player ? 0 : 1]) - pips(s.hands[player]),
  hint: (s) => {
    const legal = moves(s);
    if (legal[0]?.to === DRAW) return `낼 수 있는 패가 없습니다. 더미에서 한 장 가져오세요 (남은 ${s.stock.length}장).`;
    if (legal[0]?.to === PASS) return "낼 수 있는 패도, 가져올 패도 없습니다. 차례를 넘기세요.";
    return s.line.length ? "끝과 숫자가 맞는 패를 고르세요." : "첫 패를 고르세요.";
  },
  tally: (s) => [0, 1].map((p) => `패 ${s.hands[p].length}장`) as [string, string],
  reason: (s) =>
    s.passes >= 2 ? `아무도 낼 수 없습니다. 남은 눈 ${pips(s.hands[0])} 대 ${pips(s.hands[1])}.` : "패를 모두 냈습니다.",
};
