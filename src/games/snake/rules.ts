import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Snake: a snake crawls across a walled garden one square at a time and
 * cannot stop. It is turned a quarter at a time, never straight back. An
 * apple eaten makes it a square longer and puts another apple somewhere
 * free; now and then a golden apple comes up for a while and is worth more.
 * It ends when the head runs into the fence, a stone or the snake's own
 * body. Every step of the clock is a move (`TICK`), like the fall in
 * falling blocks: the view only keeps the clock.
 */
export const W = 19,
  H = 13,
  TICK = 0,
  /** A turn toward a direction: TURN + 0 up, 1 right, 2 down, 3 left. */
  TURN = 10,
  /** Apples to have eaten for the game to count as won when it ends. */
  GOAL = 20,
  /** A golden apple comes up after every `GOLD_EVERY` apples and stays for `GOLD_LIFE` steps. */
  GOLD_EVERY = 5,
  GOLD_LIFE = 45,
  APPLE = 10,
  GOLD = 50;
export const STEPS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** The levels: how fast the snake starts, and the stones laid in the garden. */
export const LEVELS = [
  { name: "느긋하게", speed: 190, stones: 0 },
  { name: "보통", speed: 140, stones: 0 },
  { name: "돌밭", speed: 140, stones: 1 },
  { name: "빠르게", speed: 105, stones: 1 },
  { name: "미로", speed: 115, stones: 2 },
];
export interface State {
  /** The squares of the snake, head first (index y × W + x). */
  body: number[];
  /** The way it is going, and the turns asked for that are still to be made (two at most). */
  dir: number;
  queue: number[];
  apple: number;
  /** A golden apple and the steps it has left, or none. */
  gold: number | null;
  goldLeft: number;
  stones: number[];
  /** Squares still to be grown. */
  grow: number;
  score: number;
  eaten: number;
  level: number;
  winner: Winner;
  /** What the last step did, for the view and the sounds. */
  last: { ate: "apple" | "gold" | null; crashed: boolean } | null;
  ply: number;
}
export const at = (x: number, y: number) => y * W + x;
export const xy = (cell: number): [number, number] => [cell % W, Math.floor(cell / W)];
/** The stones of a level: none, a few short walls, or a maze of longer ones; all clear of the snake's starting row. */
export function stonesOf(level: number): number[] {
  const kind = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))].stones,
    out: number[] = [];
  if (kind >= 1)
    // An L of three stones in each quarter of the garden, its corner toward the garden's corner.
    for (const [x0, y0] of [[4, 2], [14, 2], [4, 10], [14, 10]]) {
      const sx = x0 < W / 2 ? 1 : -1,
        sy = y0 < H / 2 ? 1 : -1;
      out.push(at(x0, y0), at(x0 + sx, y0), at(x0, y0 + sy));
    }
  if (kind >= 2) {
    for (let x = 7; x <= 11; x++) out.push(at(x, 3), at(x, 9));
    for (const y of [5, 7]) out.push(at(1, y), at(W - 2, y));
  }
  return [...new Set(out)];
}
/** A free square for an apple. */
function free(state: Pick<State, "body" | "stones" | "apple" | "gold">, random: Random) {
  const taken = new Set([...state.body, ...state.stones, state.apple, state.gold ?? -1]),
    open: number[] = [];
  for (let c = 0; c < W * H; c++) if (!taken.has(c)) open.push(c);
  return open.length ? open[Math.floor(random() * open.length) % open.length] : -1;
}
export function createGame(level = 1, random: Random = cryptoRandom): State {
  const lv = Math.max(1, Math.min(LEVELS.length, Math.round(level) || 1)),
    y = Math.floor(H / 2),
    body = [at(6, y), at(5, y), at(4, y)],
    stones = stonesOf(lv),
    base = { body, stones, apple: -1, gold: null };
  return { body, dir: 1, queue: [], apple: free(base, random), gold: null, goldLeft: 0, stones, grow: 0, score: 0, eaten: 0, level: lv, winner: null, last: null, ply: 0 };
}
/** Milliseconds between two steps: the level's pace, a little quicker for every apple, down to two thirds of it. */
export const interval = (state: Pick<State, "level" | "eaten">) => {
  const base = LEVELS[state.level - 1].speed;
  return Math.max(base * 0.66, base - state.eaten * 2.5);
};
/** The way the snake will be going once the turns asked for are made. */
const heading = (state: State) => (state.queue.length ? state.queue[state.queue.length - 1] : state.dir);
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out = [TICK],
    now = heading(state);
  for (let d = 0; d < 4; d++) if (d !== now && d !== (now + 2) % 4 && state.queue.length < 2) out.push(TURN + d);
  return out.map((to) => ({ from: -1, to, extra: -1 }));
}
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  if (move.to >= TURN && move.to < TURN + 4) {
    const d = move.to - TURN,
      now = heading(state);
    // Never straight back into itself, nor the way it is already going; two turns may wait their steps.
    if (d === now || d === (now + 2) % 4 || state.queue.length >= 2) return null;
    return { ...state, queue: [...state.queue, d], ply: state.ply + 1, last: null };
  }
  if (move.to !== TICK) return null;
  const dir = state.queue.length ? state.queue[0] : state.dir,
    queue = state.queue.slice(1),
    [hx, hy] = xy(state.body[0]),
    [dx, dy] = STEPS[dir],
    nx = hx + dx,
    ny = hy + dy,
    next = { ...state, dir, queue, ply: state.ply + 1 };
  const head = at(nx, ny),
    grows = state.grow > 0 || head === state.apple || head === state.gold,
    // The tail moves on in the same step, so the head may take the square it leaves (unless the snake is growing).
    body = grows ? state.body : state.body.slice(0, -1);
  if (nx < 0 || ny < 0 || nx >= W || ny >= H || state.stones.includes(head) || body.includes(head)) {
    const winner: Winner = state.eaten >= GOAL ? 0 : 1;
    return { ...next, winner, last: { ate: null, crashed: true } };
  }
  let after: State = { ...next, body: [head, ...body], grow: Math.max(0, state.grow - 1), last: { ate: null, crashed: false } };
  if (head === state.apple) {
    const eaten = state.eaten + 1;
    // The tail stayed where it was this step: that is the square it grows.
    after = { ...after, eaten, score: state.score + APPLE, last: { ate: "apple", crashed: false } };
    after = { ...after, apple: free({ ...after, apple: -1 }, random) };
    // Every few apples a golden one comes up somewhere else for a while.
    if (eaten % GOLD_EVERY === 0 && after.gold === null) {
      const gold = free(after, random);
      if (gold >= 0) after = { ...after, gold, goldLeft: GOLD_LIFE };
    }
  } else if (state.gold !== null && head === state.gold) {
    // Two squares: one now (the tail stayed), one with the next step.
    after = { ...after, gold: null, goldLeft: 0, score: state.score + GOLD, grow: after.grow + 1, last: { ate: "gold", crashed: false } };
  } else if (after.gold !== null) {
    const left = after.goldLeft - 1;
    after = left > 0 ? { ...after, goldLeft: left } : { ...after, gold: null, goldLeft: 0 };
  }
  // The garden full: nothing more to eat, and that is a win.
  if (after.apple < 0) return { ...after, winner: 0 };
  return after;
}
const effect = (): Effect | null => null;
export const snake: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move, random) => play(state, move, random),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: () => 0,
  hint: () => "방향을 바꿔 사과를 먹으세요.",
  tally: (state) => [`${state.score}점`, ""],
  reason: (state) =>
    state.winner === 0 && state.apple < 0
      ? `정원을 가득 채웠습니다! 사과 ${state.eaten}개, ${state.score}점.`
      : state.winner === 0
        ? `성공! 사과 ${state.eaten}개를 먹고 ${state.score}점을 얻었습니다.`
        : `부딪혔습니다. 사과 ${state.eaten}개, ${state.score}점. ${GOAL}개를 먹으면 성공입니다.`,
};
