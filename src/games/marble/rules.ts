import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Marble shooting: marbles on a tray of seven by eight hollows. A marble is
 * shot along a row or a column at another that stands at least one hollow
 * away; it stops beside the one it strikes, which rolls on in its turn, and
 * so down the line until the last one rolls off the tray. Every shot takes
 * one marble off; the tray is solved with one marble left. Each tray is
 * laid at random, backwards from a single marble, so that it can be solved.
 */
export const W = 7,
  H = 8,
  DX = [0, 1, 0, -1],
  DY = [-1, 0, 1, 0],
  /** How many colours the marbles come in. */
  COLOURS = 3;
export interface State {
  cells: boolean[];
  /** The colour of the marble in each hollow (1–3), 0 where there is none; a marble keeps its colour as it rolls. */
  tints: number[];
  winner: Winner;
  /** How many marbles the tray began with. */
  size: number;
  /** What the last shot did, marble by marble: where each rolled from and to (-1 off the tray), and which way. */
  last: { dir: number; rolls: { from: number; to: number }[] } | null;
  ply: number;
}
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
/** The first marble met going from a hollow in a direction, and how many hollows away it is; null when the way is clear to the edge. */
function ahead(cells: boolean[], from: number, dir: number) {
  let x = (from % W) + DX[dir],
    y = Math.floor(from / W) + DY[dir];
  for (let far = 1; inside(x, y); far++, x += DX[dir], y += DY[dir]) if (cells[y * W + x]) return { at: y * W + x, far };
  return null;
}
export const count = (state: State) => state.cells.filter(Boolean).length;
/** A shot is told by the marble shot and the marble it strikes first. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  state.cells.forEach((marble, from) => {
    if (!marble) return;
    for (let dir = 0; dir < 4; dir++) {
      const hit = ahead(state.cells, from, dir);
      if (hit && hit.far >= 2) out.push({ from, to: hit.at, extra: -1 });
    }
  });
  return out;
}
/** Which way a shot goes, or -1 when the two hollows are not in one line. */
export const direction = (from: number, to: number) => {
  const dx = (to % W) - (from % W),
    dy = Math.floor(to / W) - Math.floor(from / W);
  return dx === 0 ? (dy < 0 ? 0 : dy > 0 ? 2 : -1) : dy === 0 ? (dx > 0 ? 1 : 3) : -1;
};
/** The tray after a shot, with every roll of it. */
function shoot(cells: boolean[], from: number, dir: number) {
  const next = cells.slice(),
    rolls: { from: number; to: number }[] = [];
  let rolling = from;
  for (;;) {
    const hit = ahead(next, rolling, dir);
    if (!hit) {
      // Nothing in the way: it rolls off the tray.
      next[rolling] = false;
      rolls.push({ from: rolling, to: -1 });
      break;
    }
    if (hit.far > 1) {
      const stop = hit.at - (DX[dir] + DY[dir] * W);
      next[rolling] = false;
      next[stop] = true;
      rolls.push({ from: rolling, to: stop });
    }
    // Struck, the next one takes up the roll (a marble touching it passes the knock on without moving).
    rolling = hit.at;
  }
  return { cells: next, rolls };
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const dir = direction(move.from, move.to),
    { cells, rolls } = shoot(state.cells, move.from, dir),
    tints = state.tints.slice();
  for (const roll of rolls) {
    if (roll.to >= 0) tints[roll.to] = tints[roll.from];
    tints[roll.from] = 0;
  }
  const next: State = { ...state, cells, tints, winner: null, last: { dir, rolls }, ply: state.ply + 1 };
  next.winner = count(next) === 1 ? 0 : moves(next).length ? null : 1;
  return next;
}
/**
 * A tray of `size` marbles that can be solved: from one marble, shots are
 * undone one after another. To undo a shot a marble is drawn back along a
 * line and a new one set beyond where it stood, with nothing behind it.
 */
export function createGame(size = 6, random: Random = cryptoRandom): State {
  const want = Math.max(2, Math.min(14, Math.round(size) || 6));
  for (let attempt = 0; attempt < 400; attempt++) {
    let cells: boolean[] = Array(W * H).fill(false);
    cells[Math.floor(random() * W * H)] = true;
    let stuck = false;
    while (cells.filter(Boolean).length < want && !stuck) {
      const undone: boolean[][] = [];
      cells.forEach((marble, at) => {
        if (!marble) return;
        const x = at % W,
          y = Math.floor(at / W);
        for (let dir = 0; dir < 4; dir++) {
          const bx = x + DX[dir],
            by = y + DY[dir];
          // The new marble stands just beyond, with a clear run to the edge behind it.
          if (!inside(bx, by) || cells[by * W + bx] || ahead(cells, by * W + bx, dir)) continue;
          for (let back = 1, px = x - DX[dir], py = y - DY[dir]; inside(px, py) && !cells[py * W + px]; back++, px -= DX[dir], py -= DY[dir]) {
            const before = cells.slice();
            before[at] = false;
            before[py * W + px] = true;
            before[by * W + bx] = true;
            // Shot again from there it must give back the tray as it is now.
            if (shoot(before, py * W + px, dir).cells.every((v, i) => v === cells[i])) undone.push(before);
          }
        }
      });
      if (!undone.length) stuck = true;
      else cells = undone[Math.floor(random() * undone.length)];
    }
    if (!stuck) return { cells, tints: cells.map((marble) => (marble ? 1 + Math.floor(random() * COLOURS) : 0)), winner: null, size: want, last: null, ply: 0 };
  }
  // Never reached in practice: two marbles in a row with a gap.
  const cells: boolean[] = Array(W * H).fill(false);
  cells[0] = cells[2] = true;
  return { cells, tints: cells.map((marble) => (marble ? 1 : 0)), winner: null, size: 2, last: null, ply: 0 };
}
/** The shots that bring a tray down to one marble, or null when it cannot be done from here. */
export function solve(state: State): Move[] | null {
  const dead = new Set<string>(),
    path: Move[] = [],
    go = (at: State): boolean => {
      if (at.winner === 0) return true;
      const key = at.cells.map((c) => (c ? 1 : 0)).join("");
      if (at.winner !== null || dead.has(key)) return false;
      for (const move of moves(at)) {
        path.push(move);
        if (go(play(at, move)!)) return true;
        path.pop();
      }
      dead.add(key);
      return false;
    };
  return go(state) ? path : null;
}
const effect = (): Effect | null => null;
export const marble: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 6),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.cells.map((m) => (m ? 0 : null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -count(s),
  hint: (s) => `구슬 ${count(s)}개 · 구슬을 다른 구슬 쪽으로 쳐서 하나만 남기세요.`,
  tally: (s) => [`남은 구슬 ${count(s)}`, ""],
  reason: (s) => (s.winner === 0 ? `성공! 구슬 ${s.size}개를 하나만 남기고 모두 쳐 냈습니다.` : `더 칠 수 있는 구슬이 없습니다. 구슬 ${count(s)}개가 남았습니다.`),
};
