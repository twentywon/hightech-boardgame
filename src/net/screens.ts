import type { Move } from "../games/points/types";
import type { StartInfo } from "./protocol";
import { NOBODY } from "./match";
import type { BoardNet } from "./boards";
import type { SeatKind } from "./protocol";
import * as yut from "../games/yut/rules";
import * as yacht from "../games/yacht/rules";
import * as tour from "../games/tour/rules";
import * as conquest from "../games/conquest/rules";

/**
 * The dice games with screens of their own (yut nori, yacht dice, the world tour, continent conquest) as a room plays
 * them (와이파이 여럿이, stage 3). Like the boards of `boards.ts` each is a `BoardNet`: every step of a turn (a throw,
 * a die held, a score, a purchase, a golden key, an attack) is a move of the seat to move, sent as the room's
 * `{from, to, extra}` and played through the game's own rules on every device; its dice and cards come from the
 * move's own random stream, so every device throws the same. A seat the host left empty may be closed (yut, the
 * tour and conquest seat two and more): the game then has as many players as seats taken, in the seats' order, and
 * `seats` says which room seat each player is.
 */
export interface Seated<G> {
  /** The room seat of each player of `game`, in the order of play. */
  seats: number[];
  game: G;
}
/** The players of a game a room starts: every seat not closed, in order. */
const takenSeats = (start: StartInfo) => start.seats.flatMap((t, i) => (t.kind === "closed" ? [] : [i]));
const int = (n: number) => Number.isInteger(n);
const AFTER_SECOND: SeatKind[] = ["computer", "closed"],
  COMPUTER: SeatKind[] = ["computer"];
const seatList = (labels: string[], colors: string[], firm = 2) => labels.map((label, i) => ({ label, color: colors[i], kinds: i < firm ? COMPUTER : AFTER_SECOND }));
/** The result of a seated game: the room seat that won, "draw" for several, null while it goes on. */
function seatedResult(seats: number[], winners: number[] | null) {
  if (!winners) return null;
  return winners.length === 1 ? (seats[winners[0]] ?? null) : "draw";
}

// ─────────────── Yut nori ───────────────
/** `from` of a throw; a move is `{from: piece, to: result}`. */
export const THROW = -1;
export const yutThrow = (): Move => ({ from: THROW, to: -1, extra: -1 });
export const yutMove = (piece: number, result: yut.Result): Move => ({ from: piece, to: result, extra: 0 });
export const yutNet: BoardNet<Seated<yut.State>> = {
  game: "yut-nori",
  seats: seatList(["청", "홍", "녹", "황"], ["#2f5fa8", "#c23b2b", "#2f8a4f", "#d9a521"]),
  create: (start) => {
    const seats = takenSeats(start);
    return { seats, game: yut.createGame(seats.length) };
  },
  play(state, move, random) {
    const game =
      move.from === THROW && move.to === -1 ? yut.throwSticks(state.game, random) : int(move.from) && move.from >= 0 && move.from < yut.PIECES && move.to in yut.RESULT_NAMES ? yut.move(state.game, move.from, move.to as yut.Result) : null;
    return game && { seats: state.seats, game };
  },
  toMove: (s) => (s.game.winner !== null ? NOBODY : s.seats[s.game.turn]),
  result: (s) => seatedResult(s.seats, s.game.winner === null ? null : [s.game.winner]),
};

// ─────────────── Yacht dice ───────────────
/** `from` of a roll, a die held or let go (`to` the die), a score (`to` the category's index). */
export const ROLL = 0,
  HOLD = 1,
  SCORE = 2;
export const yachtRoll = (): Move => ({ from: ROLL, to: -1, extra: -1 });
export const yachtHold = (die: number): Move => ({ from: HOLD, to: die, extra: -1 });
export const yachtScore = (category: yacht.Category): Move => ({ from: SCORE, to: yacht.CATEGORIES.indexOf(category), extra: -1 });
export const yachtNet: BoardNet<yacht.State> = {
  game: "yacht-dice",
  seats: seatList(["선공", "후공"], ["#c23b2b", "#2f5fa8"]),
  create: () => yacht.createGame(2),
  play(state, move, random) {
    if (move.from === ROLL) return yacht.roll(state, random);
    if (move.from === HOLD) return yacht.toggleHold(state, move.to);
    const category = move.from === SCORE ? yacht.CATEGORIES[move.to] : undefined;
    return category ? yacht.score(state, category) : null;
  },
  toMove: (s) => (s.over ? NOBODY : s.turn),
  result: (s) => yacht.winner(s),
};

// ─────────────── World tour ───────────────
/** What a step of the tour is (`from`); `to` carries its one value. */
export const TOUR = { roll: 0, draw: 1, follow: 2, travel: 3, decide: 4, end: 5, sell: 6 } as const;
export type TourStep = keyof typeof TOUR;
export const tourMove = (step: TourStep, value = -1): Move => ({ from: TOUR[step], to: value, extra: -1 });
export const tourNet: BoardNet<Seated<tour.State>> = {
  game: "world-tour",
  seats: seatList(["빨강", "파랑", "초록", "노랑"], ["#d2452f", "#2f62c0", "#3f9a5a", "#e0a020"]),
  create: (start) => {
    const seats = takenSeats(start);
    return { seats, game: tour.createGame(seats.length) };
  },
  play(state, move, random) {
    const s = state.game;
    let game: tour.State | null = null;
    switch (move.from) {
      case TOUR.roll:
        game = tour.roll(s, random);
        break;
      case TOUR.draw:
        game = tour.draw(s, random);
        break;
      case TOUR.follow:
        game = tour.follow(s);
        break;
      case TOUR.travel:
        game = tour.travel(s, move.to);
        break;
      case TOUR.decide:
        game = move.to === 0 || move.to === 1 ? tour.decide(s, move.to === 1) : null;
        break;
      case TOUR.end:
        game = tour.endTurn(s);
        break;
      case TOUR.sell:
        // Only the traveller to move sells, and only its own.
        game = int(move.to) && move.to >= 0 && move.to < tour.SPACES.length ? tour.sell(s, s.turn, move.to) : null;
        break;
    }
    return game && { seats: state.seats, game };
  },
  toMove: (s) => (s.game.phase === "over" ? NOBODY : s.seats[s.game.turn]),
  result: (s) => seatedResult(s.seats, s.game.phase === "over" ? s.game.winners : null),
};

// ─────────────── Continent conquest ───────────────
/**
 * Conquest over Wi-Fi: the classic world conquest, capitals and turn limit (secret missions are hidden, so they wait
 * for the stage that hides information; a room asked for them plays world conquest). Each player's cards are shown
 * only on that player's own screen, but the state that holds them, like every move, is on every device: a player who
 * reads the page's memory could see them until the hidden-information stage. The host's options say the map, how the
 * game begins, the move rule, the mode, the rounds and the computers' level.
 */
export const CONQUEST_ACTIONS = ["trade", "place", "attack", "occupy", "fortify", "next"] as const;
/** Territories and card ids are packed by sevens of bits (every map has fewer than 128 of each). */
const PACK = 128;
export function conquestMove(action: conquest.Action): Move {
  const from = CONQUEST_ACTIONS.indexOf(action.type);
  switch (action.type) {
    case "trade":
      return { from, to: action.cards[0] + PACK * action.cards[1] + PACK * PACK * action.cards[2], extra: action.bonus ?? -1 };
    case "place":
      return { from, to: action.territory, extra: action.count };
    case "attack":
      return { from, to: action.from + PACK * action.to, extra: (action.dice ?? 0) + (action.blitz ? 8 : 0) };
    case "occupy":
      return { from, to: -1, extra: action.count };
    case "fortify":
      return { from, to: action.from + PACK * action.to, extra: action.count };
    case "next":
      return { from, to: -1, extra: -1 };
  }
}
/** A room's move read back as a conquest action, or null if it is none. */
export function conquestAction(move: Move): conquest.Action | null {
  const type = CONQUEST_ACTIONS[move.from],
    pair = (n: number) => (int(n) && n >= 0 && n < PACK * PACK ? [n % PACK, Math.floor(n / PACK)] : null);
  switch (type) {
    case "trade": {
      if (!int(move.to) || move.to < 0 || move.to >= PACK ** 3) return null;
      const cards = [move.to % PACK, Math.floor(move.to / PACK) % PACK, Math.floor(move.to / PACK / PACK)];
      return { type, cards, ...(move.extra >= 0 ? { bonus: move.extra } : {}) };
    }
    case "place":
      return { type, territory: move.to, count: move.extra };
    case "attack": {
      const p = pair(move.to),
        dice = move.extra % 8;
      if (!p || move.extra < 0 || move.extra >= 16) return null;
      return { type, from: p[0], to: p[1], ...(move.extra >= 8 ? { blitz: true } : {}), ...(dice ? { dice } : {}) };
    }
    case "occupy":
      return { type, count: move.extra };
    case "fortify": {
      const p = pair(move.to);
      return p && { type, from: p[0], to: p[1], count: move.extra };
    }
    case "next":
      return { type };
  }
  return null;
}
/** The options of a room's conquest, read from the host's setup. */
export function conquestOptions(start: StartInfo, players: number): conquest.Options {
  const o = start.options,
    pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(value as T) ? (value as T) : fallback);
  const mode = pick(o.mode, ["conquest", "capitals", "turns"] as const, "conquest");
  return {
    players,
    world: o.map !== "random",
    size: pick(o.size, ["small", "medium", "large"] as const, "small"),
    start: pick(o.start, ["claim", "random"] as const, "claim"),
    move: pick(o.move, ["adjacent", "connected"] as const, "adjacent"),
    mode,
    rounds: conquest.ROUND_CHOICES.includes(Number(o.rounds)) ? Number(o.rounds) : conquest.ROUND_CHOICES[1],
    // The game goes on among the computers once every person is out: people sit anywhere in a room.
    people: 0,
  };
}
export const conquestNet: BoardNet<Seated<conquest.State>> = {
  game: "continent-conquest",
  seats: seatList(["빨강", "파랑", "초록", "노랑", "보라", "검정"], ["#c9392b", "#2a62c4", "#3b9a4c", "#e2a21b", "#8a4ec2", "#2c2c30"]),
  create: (start, random) => {
    const seats = takenSeats(start);
    return { seats, game: conquest.createGame(conquestOptions(start, seats.length), random) };
  },
  play(state, move, random) {
    const action = conquestAction(move),
      game = action && conquest.play(state.game, action, random);
    return game && { seats: state.seats, game };
  },
  toMove: (s) => (s.game.phase === "over" ? NOBODY : (s.seats[s.game.turn] ?? NOBODY)),
  result: (s) => seatedResult(s.seats, s.game.phase === "over" ? s.game.winners : null),
};
