import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Indian poker for two: each holds one card against the forehead, face out,
 * so that each sees the other's card and not its own. They bet on it; the
 * higher card takes the pot at a showdown. A game is one pack, one to ten
 * twice: it is played through to the last card, ten rounds, and whoever then
 * holds more has won; unless one side runs out of chips first, which ends it.
 */
export const START_CHIPS = 30,
  ANTE = 1,
  /** What it costs to fold when one's own card turns out to be the ten. */
  TEN_PENALTY = 10,
  FOLD = 0,
  CALL = 1,
  /** Raising by one, two or three: points 2, 3 and 4. */
  RAISE = 1,
  NEXT = 5,
  /** Both raise the cards they have been dealt to their foreheads: the round begins. */
  READY = 6,
  /** My bet is set before it is made: one fewer, one more, and made. */
  DOWN = 7,
  UP = 8,
  DECIDE = 9,
  /** A pack of twenty gives ten rounds. */
  ROUNDS = 10;
export interface State {
  deck: number[];
  cards: [number, number];
  chips: [number, number];
  /** What each has put in this round, the ante included; and what was left on the table by a tie. */
  bets: [number, number];
  carry: number;
  turn: 0 | 1;
  /** "show" once the round is decided: both cards are seen and side 0 deals the next. */
  /** "ready": the cards lie face down, not yet raised; "bet"; "show" once the round is decided. */
  phase: "ready" | "bet" | "show";
  /** Who folded this round, or null. */
  folded: 0 | 1 | null;
  /** Who bets first this round, and whether that side has checked. */
  first: 0 | 1;
  checked: boolean;
  /** How much the mover means to raise by, set with UP and DOWN and made with DECIDE. */
  wager: number;
  round: number;
  /** How the round ended, for the status line. */
  result: string;
  winner: Winner;
  ply: number;
}
const NAMES = ["나", "컴퓨터"];
function deal(state: State): State {
  const deck = state.deck.slice(),
    cards: [number, number] = [deck.pop()!, deck.pop()!],
    // Whoever has nothing left still gets a card: the pack is played out.
    bets: [number, number] = [Math.min(ANTE, state.chips[0]), Math.min(ANTE, state.chips[1])],
    chips: [number, number] = [state.chips[0] - bets[0], state.chips[1] - bets[1]];
  // Nothing is seen yet: I raise the cards (mine and, with it, the figure its own) before anyone bets.
  return { ...state, deck, cards, chips, bets, turn: 0, phase: "ready", folded: null, checked: false, wager: 0, result: "" };
}
export function createGame(random: Random = cryptoRandom): State {
  const deck = Array.from({ length: 20 }, (_, i) => (i % 10) + 1);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deal({ deck, cards: [0, 0], chips: [START_CHIPS, START_CHIPS], bets: [0, 0], carry: 0, turn: 0, phase: "bet", folded: null, first: 0, checked: false, wager: 0, round: 1, result: "", winner: null, ply: 0 });
}
export const pot = (state: State) => state.bets[0] + state.bets[1] + state.carry;
/** What the mover must add to stay in. */
export const owed = (state: State) => state.bets[state.turn ? 0 : 1] - state.bets[state.turn];
/** The most the mover may raise by. */
export const most = (state: State) => Math.max(0, Math.min(state.chips[state.turn] - owed(state), state.chips[state.turn ? 0 : 1]));
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const to = (point: number): Move => ({ from: -1, to: point, extra: -1 });
  if (state.phase === "show") return [to(NEXT)];
  if (state.phase === "ready") return [to(READY)];
  const me = state.turn,
    out = [to(CALL)],
    due = owed(state);
  if (due > 0) out.push(to(FOLD));
  // A raise must be covered by both: the mover after calling, the other in answering it.
  for (let n = 1; n <= 3; n++) if (n <= most(state)) out.push(to(RAISE + n));
  if (state.wager < most(state)) out.push(to(UP));
  if (state.wager > 0) out.push(to(DOWN));
  out.push(to(DECIDE));
  return out;
}
function settle(state: State, taker: 0 | 1 | null, result: string): State {
  const chips: [number, number] = [state.chips[0], state.chips[1]];
  if (taker !== null) chips[taker] += pot(state);
  // Whoever has no chip left to bet, and none waiting on the table, is bankrupt: the game ends there.
  const broke = taker === null ? null : chips[0] === 0 ? 0 : chips[1] === 0 ? 1 : null;
  return { ...state, chips, carry: taker === null ? pot(state) : 0, bets: [0, 0], phase: "show", turn: 0, result, winner: broke === null ? state.winner : broke ? 0 : 1 };
}
export function play(state: State, move: Move): State | null {
  if (move.from !== -1 || move.extra !== -1 || !moves(state).some((m) => m.to === move.to)) return null;
  // Setting the bet is no move yet: nothing is put in until it is made.
  if (move.to === UP || move.to === DOWN) return { ...state, wager: state.wager + (move.to === UP ? 1 : -1) };
  const me = state.turn,
    other = (me ? 0 : 1) as 0 | 1,
    more = move.to === DECIDE ? state.wager : move.to - RAISE,
    next: State = { ...state, ply: state.ply + 1, wager: 0, chips: [state.chips[0], state.chips[1]], bets: [state.bets[0], state.bets[1]] };
  if (move.to === NEXT) {
    // The game is the pack: it ends when the last two cards have been played.
    if (state.deck.length < 2) {
      const [a, b] = state.chips;
      return { ...next, winner: a === b ? "draw" : a > b ? 0 : 1 };
    }
    return deal({ ...next, first: state.first ? 0 : 1, round: state.round + 1 });
  }
  if (move.to === READY) return { ...next, phase: "bet", turn: state.first };
  if (move.to === FOLD) {
    next.folded = me;
    // Folding the ten costs dear.
    const penalty = state.cards[me] === 10 ? Math.min(TEN_PENALTY, next.chips[me]) : 0;
    next.chips[me] -= penalty;
    next.chips[other] += penalty;
    return settle(next, other, `${NAMES[me]}이(가) 접었습니다${penalty ? ` — 접은 카드가 10이라 ${penalty}개를 더 냅니다` : ""}.`);
  }
  const due = Math.min(owed(state), next.chips[me]);
  next.chips[me] -= due;
  next.bets[me] += due;
  if (move.to === CALL || (move.to === DECIDE && more === 0)) {
    // A check by the first to speak passes the word; anything else that matches the bets shows the cards.
    if (owed(state) === 0 && me === state.first && !state.checked) return { ...next, checked: true, turn: other };
    // Whoever could not match gets shown the cards for what was put in; the rest goes back.
    const over = next.bets[other] - next.bets[me];
    if (over > 0) {
      next.bets[other] -= over;
      next.chips[other] += over;
    }
    const [a, b] = state.cards;
    return settle(next, a === b ? null : a > b ? 0 : 1, a === b ? "비겼습니다. 판돈은 다음 판으로 넘어갑니다." : `${NAMES[a > b ? 0 : 1]}의 카드가 높습니다.`);
  }
  next.chips[me] -= more;
  next.bets[me] += more;
  return { ...next, turn: other };
}
/**
 * The computer's bet. It sees my card and what has been bet, never its own
 * card: the lower mine, the likelier its own is higher.
 */
export function chooseBet(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (!legal.length) return null;
  if (state.phase !== "bet") return legal[0];
  const has = (point: number) => legal.find((m) => m.to === point),
    seen = state.cards[state.turn ? 0 : 1],
    // The chance that an unseen card beats the one it sees.
    chance = (10 - seen) / 10 + (level === "easy" ? (random() - 0.5) * 0.5 : 0),
    due = owed(state),
    bluff = level !== "easy" && random() < (level === "hard" ? 0.18 : 0.08),
    raise = (n: number) => has(RAISE + n) ?? has(RAISE + 1) ?? has(CALL)!;
  if (due > 0) {
    // What it costs to see the cards against what lies on the table.
    const price = due / (pot(state) + due);
    if (chance > 0.75 || bluff) return raise(chance > 0.88 ? 3 : 2);
    if (chance >= price + 0.08) return has(CALL)!;
    return has(FOLD) ?? has(CALL)!;
  }
  if (chance > 0.6 || bluff) return raise(chance > 0.85 ? 3 : chance > 0.72 ? 2 : 1);
  return has(CALL)!;
}
/** What pressing 결정 would do now. */
export const wagerText = (s: State) => (s.wager > 0 ? `내 베팅 ${Math.min(owed(s), s.chips[s.turn]) + s.wager}` : owed(s) > 0 ? `콜 ${Math.min(owed(s), s.chips[s.turn])}` : "체크");
const effect = (): Effect | null => null;
export const indian: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseBet,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => Array(10).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.chips[player] - s.chips[player ? 0 : 1],
  // My own card is told only once the round is over.
  hint: (s) =>
    s.phase === "show"
      ? `${s.result} 내 카드 ${s.cards[0]}, 상대 카드 ${s.cards[1]}. ${s.deck.length < 2 ? "마지막 판이었습니다. 결과를 확인하세요." : "다음 판을 받으세요."}`
      : s.phase === "ready"
        ? `${s.round}/${ROUNDS}판 · 카드를 받았습니다. '이마에 얹기'를 눌러 시작하세요.`
        : `${s.round}/${ROUNDS}판 · 상대 카드는 ${s.cards[1]}입니다. 판돈 ${pot(s)}${owed(s) > 0 ? ` · 따라가려면 ${owed(s)}` : ""}${s.turn === 0 ? ` · ${wagerText(s)}` : ""}.`,
  tally: (s) => [0, 1].map((p) => `칩 ${s.chips[p]}${s.phase === "bet" ? ` · 건 칩 ${s.bets[p]}` : ""}`) as [string, string],
  reason: (s) =>
    s.chips[0] === 0 || s.chips[1] === 0
      ? `${s.result} 내 카드 ${s.cards[0]}, 상대 카드 ${s.cards[1]}. ${NAMES[s.chips[0] === 0 ? 0 : 1]}의 칩이 모두 떨어졌습니다.`
      : `한 덱 ${s.round}판을 모두 마쳤습니다. 칩 ${s.chips[0]} 대 ${s.chips[1]}.`,
};
