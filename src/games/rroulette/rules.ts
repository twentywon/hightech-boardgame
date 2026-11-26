import { josa } from "../../core/josa";
import type { GameOptions, Move, PointGame, Winner } from "../points/types";

/**
 * 러시안 룰렛 as a party game (the user asked), with a toy: a bright plastic cap revolver of six chambers, one of them
 * holding a "펑!" cap. Two to four round a party table pass it round in turn (me, then my left, across, my right). On
 * a turn the one holding it either pulls the trigger as it is (그냥 당기기), or first spins the cylinder (원통 돌리기,
 * a few times a game each). A click is safe and the toy goes on; a 펑 bursts a party popper of confetti over the one
 * who pulled, who is out. The last one left wins.
 *
 * Nobody knows where the cap is, not even the rules: a pull goes off with the chance it would have with the cap lying
 * somewhere in the chambers not yet fired since the last spin (`left`), drawn when the trigger is pulled from the
 * `random` given to `play` (over Wi-Fi the host's salted stream, so that no device can know it beforehand). That is
 * the same game as a cap laid at random and the chambers turning one by one: six pulls with no spin always find it.
 * After a 펑 a new cap goes in and the cylinder is spun for whoever is next.
 *
 * Free of the page and of Three.js. A point game (`points/types.ts`): side 0 is me (seat 0), side 1 any of the others.
 */
export const SEATS = 4;
export const CHAMBERS = 6;
/** The moves, as the points a tool or a press on the toy stands for. */
export const SPIN = 0;
export const PULL = 1;
/** How many times each may spin the cylinder in a game, unless set otherwise. */
export const SPINS = 2;

export interface Shot {
  seat: number;
  spun: boolean;
  bang: boolean;
  /** The chambers left unfired (since a spin) as the trigger was pulled: the chance of a 펑 was 1 in this. */
  odds: number;
}
export interface State {
  /** The seats in this game (a closed seat, or one no computer was asked for, is not). */
  seated: boolean[];
  /** Against the computer: the game ends as soon as I am out (over Wi-Fi it goes on to the last one left). */
  solo?: boolean;
  /** Who is out of the game (a 펑, or a seat nobody sits at). */
  out: boolean[];
  /** The seat holding the toy. */
  seat: number;
  /** The chambers not fired since the last spin: the next pull goes off with a chance of 1 in this. */
  left: number;
  /** How many spins each seat has left. */
  spins: number[];
  /** Pulls so far. */
  ply: number;
  /** Which chamber stands under the hammer, for the toy's cylinder to be drawn turned (one step a pull, anywhere after a spin). */
  turn: number;
  last: Shot | null;
  champion: number | null;
  /** Side 0's result: 0 when seat 0 is the last one left, 1 when someone else is. */
  winner: Winner;
}

/** The next seat round the table from `from` that is still in. */
export function onward(s: Pick<State, "out">, from: number) {
  for (let k = 1; k <= SEATS; k++) {
    const seat = (from + k) % SEATS;
    if (!s.out[seat]) return seat;
  }
  return from;
}
export const still = (s: Pick<State, "out">) => s.out.flatMap((o, k) => (o ? [] : [k]));

/** A new game for the seats `seated`, each with `spins` spins; the first seated seat holds the toy. */
export function lay(seated: boolean[], spins: number, random: () => number = Math.random): State {
  const out = Array.from({ length: SEATS }, (_, k) => !seated[k]);
  return {
    seated: out.map((o) => !o),
    out,
    seat: out.indexOf(false),
    left: CHAMBERS,
    spins: out.map((o) => (o ? 0 : spins)),
    ply: 0,
    turn: Math.floor(random() * CHAMBERS),
    last: null,
    champion: null,
    winner: null,
  };
}
/** The seats played against the computer: me and one, two or three computers round the table. */
export function seatsFor(rivals: number): boolean[] {
  return rivals <= 1 ? [true, false, true, false] : rivals === 2 ? [true, true, false, true] : [true, true, true, true];
}
const spinsOf = (options?: GameOptions) => {
  const n = Number(options?.spins ?? SPINS);
  return Number.isFinite(n) ? Math.max(0, Math.min(6, Math.round(n))) : SPINS;
};

export function create(_variant = "", options?: GameOptions, random: () => number = Math.random): State {
  return { ...lay(seatsFor(Number(options?.rivals ?? 3)), spinsOf(options), random), solo: true };
}
/** The same, for a room: the seats a person or a computer took. */
export function createFor(seated: boolean[], options: GameOptions | undefined, random: () => number) {
  return lay(seated, spinsOf(options), random);
}

export const spinMove: Move = { from: -1, to: SPIN, extra: -1 };
export const pullMove: Move = { from: -1, to: PULL, extra: -1 };

export function legal(s: State): Move[] {
  if (s.winner !== null) return [];
  return s.spins[s.seat] > 0 ? [spinMove, pullMove] : [pullMove];
}
export function play(s: State, move: Move, random: () => number = Math.random): State | null {
  if (s.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const spun = move.to === SPIN;
  if (!spun && move.to !== PULL) return null;
  if (spun && s.spins[s.seat] <= 0) return null;
  const odds = spun ? CHAMBERS : s.left,
    // A spin lands anywhere (the drawing turns to some chamber); the pull is the draw that counts.
    turn = spun ? Math.floor(random() * CHAMBERS) : s.turn,
    bang = random() * odds < 1,
    spins = spun ? s.spins.map((n, k) => (k === s.seat ? n - 1 : n)) : s.spins,
    last: Shot = { seat: s.seat, spun, bang, odds },
    base = { ...s, spins, ply: s.ply + 1, last, turn: (turn + 1) % CHAMBERS };
  if (!bang) return { ...base, left: odds - 1, seat: onward(s, s.seat) };
  const out = s.out.map((o, k) => o || k === s.seat),
    left = out.flatMap((o, k) => (o ? [] : [k]));
  if (left.length <= 1) {
    const champion = left[0] ?? null;
    return { ...base, out, left: CHAMBERS, champion, winner: champion === 0 ? 0 : 1 };
  }
  // Against the computer my 펑 ends it: the computers' game is not played out.
  if (s.solo && s.seat === 0) return { ...base, out, left: CHAMBERS, champion: null, winner: 1 };
  // A new cap, the cylinder spun, for the next one round.
  return { ...base, out, left: CHAMBERS, seat: onward({ out }, s.seat), turn: Math.floor(random() * CHAMBERS) };
}

/**
 * The computer's choice: spin when the chance of a 펑 has grown more than it can bear, keeping its spins for when
 * the odds are worst. The easy one is rash (it may pull at 1 in 2, and now and then spins for nothing); the hard one
 * reckons its spins against the pulls that may still come round to it.
 */
export function choose(s: State, level: "easy" | "normal" | "hard", random: () => number): Move | null {
  if (s.winner !== null) return null;
  const mine = s.spins[s.seat];
  if (!mine || s.left >= CHAMBERS) return pullMove;
  if (s.left === 1) return spinMove;
  const risk = 1 / s.left;
  if (level === "easy") return random() < (risk >= 0.5 ? 0.6 : 0.12) ? spinMove : pullMove;
  if (level === "normal") return risk >= 1 / 3 || (risk >= 1 / 4 && mine >= 2) ? spinMove : pullMove;
  // Hard: how many more turns of mine may come before the toy is reset, against the spins in hand.
  const people = still(s).length,
    turnsAhead = Math.max(1, Math.ceil((s.left - 1) / people));
  return risk >= 1 / 3 || (risk >= 1 / 4 && mine > turnsAhead) || (risk > 1 / 5 && mine >= 3) ? spinMove : pullMove;
}

const PEOPLE = ["나", "왼쪽 사람", "맞은편 사람", "오른쪽 사람"];
const named = (k: number) => `${PEOPLE[k]}${josa(PEOPLE[k], "이", "가")}`;
export const rRoulette: PointGame<State> = {
  create,
  moves: legal,
  play,
  choose,
  turn: (s) => (s.seat === 0 ? 0 : 1),
  winner: (s) => s.winner,
  owners: () => [],
  effect: () => null,
  ply: (s) => s.ply,
  evaluate: (s, player) => {
    const mine = s.out[0] ? -1 : 1 / Math.max(1, still(s).length);
    return player === 0 ? mine : -mine;
  },
  hint: (s) => {
    if (s.seat !== 0) return `${PEOPLE[s.seat]} 차례`;
    return s.spins[0] > 0 ? `원통을 돌리거나 그냥 당기세요 (펑 확률 1/${s.left})` : `방아쇠를 당기세요 (펑 확률 1/${s.left})`;
  },
  tally: (s) => [`돌리기 ${s.spins[0]}번`, `남은 사람 ${still(s).length}`],
  reason: (s) => {
    const c = s.champion;
    if (c === null) return s.out[0] ? "펑! 내가 탈락했습니다." : "모두 펑!";
    return c === 0 ? "끝까지 펑을 피했습니다." : `${named(c)} 끝까지 펑을 피했습니다.`;
  },
};
