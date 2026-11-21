import { cryptoRandom, type Random } from "../../core/random";
import type { GameOptions, Move, Winner } from "../points/types";

/**
 * 숫자 코드, the deduction game widely known as 다빈치 코드: tiles 0–11 in black
 * and in white (and, if chosen, a black and a white joker, marked −) stand in
 * each player's row, smallest at the left, a black left of a white of the same
 * number; a joker stands wherever its owner puts it. A turn: draw a tile from
 * the pool while any is left, point at another player's hidden tile and say a
 * number. Right, the tile is laid face up and the guesser may guess again or
 * stop, the drawn tile then going into the row hidden; wrong, the drawn tile
 * goes into the row face up (with the pool empty the guesser lays one of their
 * own hidden tiles face up instead). A player with every tile face up is out;
 * the last with a hidden tile wins. Me against one to three computers: hidden
 * tiles cannot be kept from people at one screen.
 *
 * A tile is a number 0–25: 2n + c for the number n and the colour c (0 black,
 * 1 white), which is also its place in the order; 24 and 25 are the jokers.
 */
export const JOKER = 12,
  TILES = 26,
  BLACK = 0,
  WHITE = 1;
/** Points: another seat's tile is `seat * SEAT + index`; the rest are clear of those. */
export const SEAT = 32,
  POOL = 200,
  GAP = 240,
  SAY = 300,
  STOP = 320,
  AGAIN = 321,
  DRAW_BLACK = 330,
  DRAW_WHITE = 331,
  HELPER = 340;
export const numberOf = (id: number) => (id >= 24 ? JOKER : id >> 1);
export const colourOf = (id: number) => (id & 1) as 0 | 1;
export const isJoker = (id: number) => id >= 24;
/** The tile of a number and a colour. */
export const tileOf = (n: number, colour: number) => (n === JOKER ? 24 + colour : n * 2 + colour);
/** How a number is said: a joker is 조커. */
export const said = (n: number) => (n === JOKER ? "조커" : String(n));
export const tileCode = (seat: number, index: number) => seat * SEAT + index;
export const codeSeat = (code: number) => Math.floor(code / SEAT);
export const codeIndex = (code: number) => code % SEAT;
export const isTileCode = (code: number) => code >= 0 && code < 4 * SEAT;

export type Phase = "joker" | "draw" | "guess" | "again" | "reveal";
export interface Last {
  kind: "joker" | "draw" | "right" | "wrong" | "stop" | "reveal";
  seat: number;
  /** The tile pointed at and the number said, for a guess. */
  target: number | null;
  said: number | null;
  /** The tile that came into the row or was laid face up. */
  tile: number | null;
  /** Seats that went out with this move. */
  out: number[];
}
export interface State {
  seats: number;
  jokers: boolean;
  /** Whether the numbers each hidden tile of the others may still be are shown under it (추리 도우미). */
  helper: boolean;
  /** Each seat's tiles, left to right. */
  rows: number[][];
  /** Which tiles lie face up, by tile. */
  open: boolean[];
  /** The face-down tiles in the middle, by place; a place emptied is null. */
  pool: (number | null)[];
  /** The seat to move: 0 is me. */
  seat: number;
  phase: Phase;
  /** The tile drawn this turn, not yet in the row. */
  held: number | null;
  /** Where a drawn joker goes in the row (its owner chose it as it was drawn). */
  heldAt: number | null;
  /** Jokers dealt to me that I have still to place in my row (the first is being placed). */
  waiting: number[];
  out: boolean[];
  /** The numbers said wrongly of each tile, by tile. */
  misses: number[][];
  /** Right guesses so far this turn. */
  streak: number;
  /** Seats in the order they went out. */
  fallen: number[];
  last: Last | null;
  winner: Winner;
  ply: number;
}
/** What each seat is called, for two, three or four players (me at the near side). */
export function seatNames(seats: number) {
  if (seats === 2) return ["나", "컴퓨터"];
  if (seats === 3) return ["나", "왼쪽 컴퓨터", "오른쪽 컴퓨터"];
  return ["나", "왼쪽 컴퓨터", "맞은편 컴퓨터", "오른쪽 컴퓨터"];
}
/** Tiles dealt to each player. */
export const handOf = (seats: number) => (seats === 4 ? 3 : 4);
function shuffle<X>(items: X[], random: Random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
/** Where a numbered tile goes in a row: right after the last smaller numbered tile (a joker after it stays after it). */
export function placeFor(row: number[], id: number) {
  let at = 0;
  row.forEach((other, i) => {
    if (!isJoker(other) && other < id) at = i + 1;
  });
  return at;
}
/** Whether a row keeps the order: its numbered tiles rise from left to right (jokers stand anywhere). */
export const ordered = (row: number[]) => row.filter((id) => !isJoker(id)).every((id, i, all) => i === 0 || all[i - 1] < id);
const opponents = (rivals: unknown) => {
  const n = Math.round(Number(rivals));
  return Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 1;
};
/** A new game: `rivals` computers (1–3), jokers in or not, the helper on or off. */
export function createGame(options: GameOptions = {}, random: Random = cryptoRandom): State {
  const seats = opponents(options.rivals ?? 1) + 1,
    jokers = options.jokers !== false,
    hand = handOf(seats),
    ids = shuffle(Array.from({ length: jokers ? TILES : 24 }, (_, i) => i), random),
    rows: number[][] = [];
  let waiting: number[] = [];
  for (let seat = 0; seat < seats; seat++) {
    const dealt = ids.slice(seat * hand, (seat + 1) * hand),
      row = dealt.filter((id) => !isJoker(id)).sort((a, b) => a - b);
    // I place my own jokers; a computer places its own wherever it likes.
    if (seat === 0) waiting = dealt.filter(isJoker).sort((a, b) => a - b);
    else for (const joker of dealt.filter(isJoker)) row.splice(Math.floor(random() * (row.length + 1)), 0, joker);
    rows.push(row);
  }
  const pool = ids.slice(seats * hand);
  return {
    seats,
    jokers,
    helper: options.helper === true,
    rows,
    open: Array.from({ length: TILES }, () => false),
    pool,
    seat: 0,
    phase: waiting.length ? "joker" : "draw",
    held: null,
    heldAt: null,
    waiting,
    out: rows.map(() => false),
    misses: Array.from({ length: TILES }, () => []),
    streak: 0,
    fallen: [],
    last: null,
    winner: null,
    ply: 0,
  };
}
/** The numbers a guess may say: 0–11, and the joker when jokers are in. */
export const sayable = (s: Pick<State, "jokers">) => Array.from({ length: s.jokers ? 13 : 12 }, (_, n) => n);
const hiddenIn = (s: State, seat: number) => s.rows[seat].filter((id) => !s.open[id]).length;
const poolLeft = (s: State) => s.pool.some((id) => id !== null);
/** Every guess open to the seat to move: each hidden tile of another seat still in, with each number. */
function guesses(s: State): Move[] {
  const out: Move[] = [];
  for (let t = 0; t < s.seats; t++) {
    if (t === s.seat || s.out[t]) continue;
    s.rows[t].forEach((id, i) => {
      if (s.open[id]) return;
      for (const n of sayable(s)) out.push({ from: -1, to: tileCode(t, i), extra: SAY + n });
    });
  }
  return out;
}
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  const own = (to: number) => ({ from: -1, to, extra: -1 }),
    // My own help is mine to switch on and off on my turn; it changes nothing in the game.
    helper = s.seat === 0 ? [own(HELPER)] : [];
  switch (s.phase) {
    case "joker":
      return [...Array.from({ length: s.rows[s.seat].length + 1 }, (_, k) => own(GAP + k)), ...helper];
    case "draw": {
      const slots = s.pool.flatMap((id, i) => (id === null ? [] : [own(POOL + i)]));
      const colours = [BLACK, WHITE].filter((c) => s.pool.some((id) => id !== null && colourOf(id) === c));
      return [...slots, ...colours.map((c) => own(c === BLACK ? DRAW_BLACK : DRAW_WHITE)), ...helper];
    }
    case "guess":
      return [...guesses(s), ...helper];
    case "again":
      return [own(STOP), own(AGAIN), ...guesses(s), ...helper];
    case "reveal":
      return [...s.rows[s.seat].flatMap((id, i) => (s.open[id] ? [] : [own(tileCode(s.seat, i))])), ...helper];
  }
}
const legal = (s: State, m: Move) => moves(s).some((x) => x.from === m.from && x.to === m.to && x.extra === m.extra);
/** Whether `seat` has every tile face up (and none in hand). */
const bare = (s: State, seat: number) => hiddenIn(s, seat) === 0 && !(s.seat === seat && s.held !== null);
/** The game is over when I am out, or when every computer is. */
function settle(s: State) {
  if (s.out[0]) s.winner = 1;
  else if (s.out.every((o, seat) => seat === 0 || o)) s.winner = 0;
}
/** Puts out every seat but the one to move that has nothing hidden left. */
function knockOut(s: State, said: number[]) {
  for (let seat = 0; seat < s.seats; seat++)
    if (!s.out[seat] && seat !== s.seat && bare(s, seat)) {
      s.out[seat] = true;
      s.fallen.push(seat);
      said.push(seat);
    }
}
/** The drawn tile goes into the row: where its order puts it, or where its owner put a joker. */
function lay(s: State, faceUp: boolean) {
  const id = s.held;
  if (id === null) return null;
  const row = [...s.rows[s.seat]];
  row.splice(isJoker(id) ? Math.min(s.heldAt ?? row.length, row.length) : placeFor(row, id), 0, id);
  s.rows[s.seat] = row;
  if (faceUp) s.open[id] = true;
  s.held = null;
  s.heldAt = null;
  return id;
}
/** Ends the turn of the seat to move: out if nothing of it is hidden, else the next seat still in begins. */
function endTurn(s: State, said: number[]) {
  if (!s.out[s.seat] && bare(s, s.seat)) {
    s.out[s.seat] = true;
    s.fallen.push(s.seat);
    said.push(s.seat);
  }
  settle(s);
  s.streak = 0;
  if (s.winner !== null) return;
  let next = s.seat;
  do next = (next + 1) % s.seats;
  while (s.out[next]);
  s.seat = next;
  s.phase = poolLeft(s) ? "draw" : "guess";
}
export function play(s: State, m: Move): State | null {
  if (!legal(s, m)) return null;
  if (m.to === HELPER) return { ...s, helper: !s.helper };
  const n: State = {
    ...s,
    rows: s.rows.map((row) => [...row]),
    open: [...s.open],
    pool: [...s.pool],
    out: [...s.out],
    misses: s.misses.map((x) => x),
    fallen: [...s.fallen],
    waiting: [...s.waiting],
    ply: s.ply + 1,
  };
  const seat = s.seat,
    gone: number[] = [];
  if (m.to === AGAIN) return { ...n, phase: "guess", ply: s.ply };
  switch (s.phase) {
    case "joker": {
      const k = m.to - GAP;
      if (n.waiting.length) {
        const joker = n.waiting.shift()!;
        n.rows[seat].splice(k, 0, joker);
        n.phase = n.waiting.length ? "joker" : poolLeft(n) ? "draw" : "guess";
        n.last = { kind: "joker", seat, target: null, said: null, tile: joker, out: [] };
      } else {
        n.heldAt = k;
        n.phase = "guess";
        n.last = { kind: "joker", seat, target: null, said: null, tile: s.held, out: [] };
      }
      return n;
    }
    case "draw": {
      const slot = m.to >= POOL && m.to < GAP ? m.to - POOL : n.pool.findIndex((id) => id !== null && colourOf(id) === (m.to === DRAW_BLACK ? BLACK : WHITE));
      const id = n.pool[slot]!;
      n.pool[slot] = null;
      n.held = id;
      n.heldAt = null;
      n.phase = isJoker(id) ? "joker" : "guess";
      n.last = { kind: "draw", seat, target: null, said: null, tile: id, out: [] };
      return n;
    }
    case "reveal": {
      const id = n.rows[seat][codeIndex(m.to)];
      n.open[id] = true;
      endTurn(n, gone);
      n.last = { kind: "reveal", seat, target: null, said: null, tile: id, out: gone };
      return n;
    }
    default: {
      if (m.to === STOP) {
        const id = lay(n, false);
        endTurn(n, gone);
        n.last = { kind: "stop", seat, target: null, said: null, tile: id, out: gone };
        return n;
      }
      const target = n.rows[codeSeat(m.to)][codeIndex(m.to)],
        number = m.extra - SAY;
      if (numberOf(target) === number) {
        n.open[target] = true;
        n.streak = s.streak + 1;
        knockOut(n, gone);
        settle(n);
        n.phase = "again";
        n.last = { kind: "right", seat, target, said: number, tile: target, out: gone };
        return n;
      }
      n.misses[target] = [...n.misses[target], number];
      // Wrong: the drawn tile goes into the row face up; with nothing drawn, one of the guesser's own is laid face up.
      if (n.held !== null) {
        const id = lay(n, true);
        endTurn(n, gone);
        n.last = { kind: "wrong", seat, target, said: number, tile: id, out: gone };
      } else {
        n.phase = "reveal";
        n.last = { kind: "wrong", seat, target, said: number, tile: null, out: gone };
      }
      return n;
    }
  }
}
/** How many tiles of a seat are still hidden. */
export const hidden = hiddenIn;
export function hint(s: State) {
  switch (s.phase) {
    case "joker":
      return s.waiting.length ? "받은 조커를 놓을 자리를 고르세요. 줄 어디에나 놓을 수 있습니다." : "뽑은 조커를 놓을 자리를 고르세요.";
    case "draw":
      return "가운데 더미에서 타일을 한 장 가져오세요.";
    case "guess":
      return s.streak ? "맞힐 타일을 하나 더 고르세요." : "상대의 숨은 타일을 누르고 숫자를 맞혀 보세요.";
    case "again":
      return "맞혔습니다! 계속 맞히거나 멈추세요.";
    case "reveal":
      return "틀렸습니다. 더미가 비었으니 내 숨은 타일 하나를 골라 공개하세요.";
  }
}
export function reason(s: State) {
  const names = seatNames(s.seats);
  if (s.winner === 0) return s.seats === 2 ? "컴퓨터의 코드를 모두 풀었습니다." : "모든 컴퓨터의 코드를 풀었습니다.";
  if (s.winner === 1) {
    const by = s.last && s.last.seat !== 0 ? `${names[s.last.seat]}가 마지막 타일을 맞혔습니다.` : "마지막 숨은 타일까지 공개했습니다.";
    return `내 코드가 모두 풀렸습니다. ${by}`;
  }
  return "";
}
