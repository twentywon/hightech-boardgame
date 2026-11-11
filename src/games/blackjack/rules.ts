import {
  RESHUFFLE_BELOW,
  createShoe,
  cryptoRandom,
  type Card,
  type Random,
} from "./shoe";
export type { Card, Rank, Suit, Random } from "./shoe";

export const START_CHIPS = 1000;
export const MIN_BET = 10;
export const MAX_BET = 500;
export const BET_STEP = 10;

/** A card on the table. `id` is its deal order within the session. */
export interface Dealt extends Card {
  id: number;
}
export type Result = "blackjack" | "win" | "push" | "lose" | "bust";
export interface Hand {
  cards: Dealt[];
  bet: number;
  /** No further action is possible: stood, bust, doubled, 21 or split aces. */
  done: boolean;
  doubled: boolean;
  /** Came from a split, so a two-card 21 is not a natural blackjack. */
  split: boolean;
  splitAces: boolean;
}
export interface HandOutcome {
  bet: number;
  result: Result;
  /** Chips handed back, stake included. */
  returned: number;
  /** returned − bet. */
  net: number;
}
export interface Outcome {
  hands: HandOutcome[];
  returned: number;
  net: number;
  /** The shoe ran out mid-round and every stake was handed back. */
  refunded: boolean;
}
/**
 * Dealing, the dealer's turn and settlement happen inside one transition, so
 * a round can never be dealt or settled twice. The table view animates the
 * difference between two states.
 */
export type Phase = "betting" | "playerTurn" | "roundComplete";
export interface State {
  phase: Phase;
  chips: number;
  /** Stake being chosen during betting. */
  bet: number;
  /** Stake of the previous round, offered again in the same page session. */
  lastBet: number;
  shoe: Card[];
  hands: Hand[];
  active: number;
  dealer: Dealt[];
  /** The dealer's second card is face down. */
  holeHidden: boolean;
  outcome: Outcome | null;
  round: number;
  nextId: number;
  /** The shoe was reshuffled at the start of the current round. */
  reshuffled: boolean;
}

const pip = (card: Card) =>
  card.rank === "A" ? 11 : "JQK".includes(card.rank) ? 10 : Number(card.rank);
/** Best total; `soft` when an ace still counts as 11. */
export function handValue(cards: readonly Card[]) {
  let total = 0,
    aces = 0;
  for (const card of cards) {
    total += pip(card);
    if (card.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}
const isTwoCard21 = (cards: readonly Card[]) =>
  cards.length === 2 && handValue(cards).total === 21;
/** Natural blackjack: the first two cards of an unsplit hand. */
export const isBlackjack = (hand: Hand) => !hand.split && isTwoCard21(hand.cards);

export function createSession(
  random: Random = cryptoRandom,
  shoe: Card[] = createShoe(random),
): State {
  return {
    phase: "betting",
    chips: START_CHIPS,
    bet: 0,
    lastBet: 0,
    shoe: shoe.slice(),
    hands: [],
    active: 0,
    dealer: [],
    holeHidden: false,
    outcome: null,
    round: 0,
    nextId: 0,
    reshuffled: false,
  };
}

/** Why `amount` cannot be the stake, or null when it can. 0 clears the stake. */
export function betError(state: State, amount: number): string | null {
  if (state.phase !== "betting") return "베팅 단계가 아닙니다";
  if (!Number.isInteger(amount) || amount < 0 || amount % BET_STEP !== 0)
    return `베팅은 ${BET_STEP} 단위입니다`;
  if (amount > MAX_BET) return `최대 베팅은 ${MAX_BET}입니다`;
  if (amount > state.chips) return "칩이 부족합니다";
  return null;
}
export function setBet(state: State, amount: number): State | null {
  return betError(state, amount) ? null : { ...state, bet: amount };
}
export const addBet = (state: State, amount: number) =>
  Number.isInteger(amount) && amount > 0
    ? setBet(state, state.bet + amount)
    : null;
/** Chooses the previous stake again; refused when it no longer fits. */
export const rebet = (state: State) =>
  state.lastBet >= MIN_BET ? setBet(state, state.lastBet) : null;

class ShoeEmpty extends Error {}
const clone = (state: State): State => ({
  ...state,
  shoe: state.shoe.slice(),
  dealer: state.dealer.slice(),
  hands: state.hands.map((h) => ({ ...h, cards: h.cards.slice() })),
});
function draw(s: State): Dealt {
  const card = s.shoe.pop();
  if (!card) throw new ShoeEmpty();
  return { ...card, id: s.nextId++ };
}
const newHand = (cards: Dealt[], bet: number, split = false): Hand => ({
  cards,
  bet,
  done: false,
  doubled: false,
  split,
  splitAces: split && cards[0].rank === "A",
});
function settle(s: State) {
  const dealer = handValue(s.dealer),
    dealerBlackjack = isTwoCard21(s.dealer);
  const hands = s.hands.map((hand): HandOutcome => {
    const { total } = handValue(hand.cards),
      natural = isBlackjack(hand);
    let result: Result;
    if (total > 21) result = "bust";
    else if (natural) result = dealerBlackjack ? "push" : "blackjack";
    else if (dealerBlackjack) result = "lose";
    else if (dealer.total > 21 || total > dealer.total) result = "win";
    else result = total === dealer.total ? "push" : "lose";
    const returned =
      result === "blackjack"
        ? hand.bet * 2.5
        : result === "win"
          ? hand.bet * 2
          : result === "push"
            ? hand.bet
            : 0;
    return { bet: hand.bet, result, returned, net: returned - hand.bet };
  });
  const returned = hands.reduce((sum, h) => sum + h.returned, 0);
  s.chips += returned;
  s.outcome = {
    hands,
    returned,
    net: hands.reduce((sum, h) => sum + h.net, 0),
    refunded: false,
  };
  s.holeHidden = false;
  s.phase = "roundComplete";
}
/** Reveals the hole card, draws to 17 when a hand is still standing, settles. */
function dealerPlays(s: State) {
  s.holeHidden = false;
  if (s.hands.some((h) => handValue(h.cards).total <= 21))
    // S17: the dealer stands on every 17, soft 17 included.
    while (handValue(s.dealer).total < 17) s.dealer.push(draw(s));
  settle(s);
}
/** Moves to the next hand that can still act, or to the dealer. */
function advance(s: State) {
  const next = s.hands.findIndex((h) => !h.done);
  if (next === -1) dealerPlays(s);
  else s.active = next;
}
/**
 * Runs a transition on a copy. A refused action returns null and leaves the
 * input untouched; an exhausted shoe hands every stake of the round back.
 */
function transition(
  state: State,
  stakes: number[],
  chipsBefore: number,
  run: (draft: State) => void | false,
): State | null {
  const draft = clone(state);
  try {
    return run(draft) === false ? null : draft;
  } catch (error) {
    if (!(error instanceof ShoeEmpty)) throw error;
    const hands = stakes.map(
      (bet): HandOutcome => ({ bet, result: "push", returned: bet, net: 0 }),
    );
    const returned = stakes.reduce((sum, bet) => sum + bet, 0);
    return {
      ...clone(state),
      phase: "roundComplete",
      chips: chipsBefore + returned,
      shoe: [],
      holeHidden: false,
      outcome: { hands, returned, net: 0, refunded: true },
    };
  }
}
const stakes = (state: State) => state.hands.map((h) => h.bet);

/** Takes the stake and deals. Reshuffles first when the shoe is running low. */
export function deal(state: State, random: Random = cryptoRandom): State | null {
  if (
    state.phase !== "betting" ||
    state.bet < MIN_BET ||
    betError(state, state.bet)
  )
    return null;
  const bet = state.bet;
  // On an empty shoe the stake comes straight back: chips end where they began.
  return transition({ ...state, lastBet: bet }, [bet], state.chips - bet, (s) => {
    s.reshuffled = s.shoe.length < RESHUFFLE_BELOW;
    if (s.reshuffled) s.shoe = createShoe(random);
    s.chips -= bet;
    s.bet = 0;
    s.round++;
    s.outcome = null;
    s.active = 0;
    const first = draw(s),
      up = draw(s),
      second = draw(s),
      hole = draw(s);
    s.hands = [newHand([first, second], bet)];
    s.dealer = [up, hole];
    s.holeHidden = true;
    s.phase = "playerTurn";
    // The dealer checks for blackjack before the player may act; a player
    // natural also ends the round at once.
    const peeks = up.rank === "A" || pip(up) === 10;
    if ((peeks && isTwoCard21(s.dealer)) || isBlackjack(s.hands[0])) {
      s.hands[0].done = true;
      settle(s);
    }
  });
}
const acting = (state: State): Hand | null => {
  if (state.phase !== "playerTurn") return null;
  const hand = state.hands[state.active];
  return hand && !hand.done ? hand : null;
};
export function hit(state: State): State | null {
  if (!acting(state)) return null;
  return transition(state, stakes(state), state.chips, (s) => {
    const hand = s.hands[s.active];
    hand.cards.push(draw(s));
    if (handValue(hand.cards).total >= 21) {
      hand.done = true;
      advance(s);
    }
  });
}
export function stand(state: State): State | null {
  if (!acting(state)) return null;
  return transition(state, stakes(state), state.chips, (s) => {
    s.hands[s.active].done = true;
    advance(s);
  });
}
/** Why the acting hand cannot double, or null when it can. */
export function doubleError(state: State): string | null {
  const hand = acting(state);
  if (!hand) return "지금은 할 수 없습니다";
  if (hand.cards.length !== 2) return "처음 두 장일 때만 가능합니다";
  if (hand.splitAces) return "스플릿한 에이스는 더블할 수 없습니다";
  if (state.chips < hand.bet) return "칩이 부족합니다";
  return null;
}
export function double(state: State): State | null {
  if (doubleError(state)) return null;
  return transition(state, stakes(state), state.chips, (s) => {
    const hand = s.hands[s.active];
    s.chips -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(draw(s));
    hand.done = true;
    advance(s);
  });
}
/** Why the acting hand cannot split, or null when it can. */
export function splitError(state: State): string | null {
  const hand = acting(state);
  if (!hand) return "지금은 할 수 없습니다";
  if (state.hands.length > 1) return "한 라운드에 한 번만 가능합니다";
  if (hand.cards.length !== 2 || hand.cards[0].rank !== hand.cards[1].rank)
    return "같은 랭크 두 장일 때만 가능합니다";
  if (state.chips < hand.bet) return "칩이 부족합니다";
  return null;
}
export function split(state: State): State | null {
  if (splitError(state)) return null;
  return transition(state, stakes(state), state.chips, (s) => {
    const [left, right] = s.hands[0].cards,
      bet = s.hands[0].bet;
    s.chips -= bet;
    s.hands = [newHand([left], bet, true), newHand([right], bet, true)];
    for (const hand of s.hands) {
      hand.cards.push(draw(s));
      // Split aces take one card each; any split 21 is an ordinary 21.
      hand.done = hand.splitAces || handValue(hand.cards).total === 21;
    }
    s.active = 0;
    advance(s);
  });
}
/** Clears the table for the next stake. */
export function nextRound(state: State): State | null {
  if (state.phase !== "roundComplete") return null;
  return {
    ...state,
    phase: "betting",
    bet: 0,
    hands: [],
    dealer: [],
    active: 0,
    holeHidden: false,
    outcome: null,
    reshuffled: false,
  };
}
/** Out of chips between rounds: only a new session can continue. */
export const isBroke = (state: State) =>
  state.phase !== "playerTurn" && state.chips < MIN_BET;

export interface Hidden {
  id: number;
  hidden: true;
}
/** The dealer's cards as the player may see them. */
export function dealerCards(state: State): (Dealt | Hidden)[] {
  return state.dealer.map((card, i) =>
    state.holeHidden && i === 1 ? { id: card.id, hidden: true } : card,
  );
}
/** Total of the dealer's face-up cards only. */
export const dealerShown = (state: State) =>
  handValue(
    state.dealer.filter((_, i) => !(state.holeHidden && i === 1)),
  );
