import { seededRandom } from "../../core/ai";
import { options, pot } from "../cards/betting";
import { NAMES, type BettingGame, type Tone } from "../cards/game";
import { wager } from "../cards/judgement";
import {
  PAIRS,
  act,
  bestPair,
  choices,
  choose,
  createDeck,
  createSession,
  handOf,
  rank,
  showdown,
  start,
  type Card,
  type State,
  type Variant,
} from "./rules";

/** Key for the card painter and for comparing cards. */
export const faceOf = (c: Card) => `${c.month}${c.kind[0]}`;
export const cardText = (c: Card) =>
  `${c.month}${c.kind === "gwang" ? "광" : c.kind === "yeol" ? "열" : ""}`;

/**
 * Chance that `hand` wins a showdown against one unknown hand, counting every
 * pair of unseen cards. A replay counts as half.
 */
export function equity(hand: readonly Card[]) {
  const mine = hand.map(faceOf);
  const unseen = createDeck().filter((c) => !mine.includes(faceOf(c)));
  let score = 0,
    total = 0;
  for (let i = 0; i < unseen.length; i++)
    for (let j = i + 1; j < unseen.length; j++) {
      const verdict = showdown([
        { seat: 0, cards: hand },
        { seat: 1, cards: [unseen[i], unseen[j]] },
      ]);
      score += verdict.rematch ? 0.5 : verdict.winners[0] === 0 ? 1 : 0;
      total++;
    }
  return score / total;
}
/**
 * Three-card game: chance that the seat to act ends with the best hand,
 * estimated by dealing the unseen cards at random. It knows its own cards and
 * the one card every other seat shows.
 */
export function equityThree(state: State, samples: number, seed: number) {
  const b = state.betting,
    me = b.turn,
    rivals = b.seats.flatMap((seat, i) => (i !== me && !seat.folded && !seat.out ? [i] : [])),
    known = new Set(state.hands[me].map(faceOf)),
    showing = rivals.map((i) => state.hands[i][state.open[i] ?? 0]);
  for (const c of showing) known.add(faceOf(c));
  const unseen = createDeck().filter((c) => !known.has(faceOf(c))),
    random = seededRandom(seed);
  let score = 0;
  for (let n = 0; n < samples; n++) {
    for (let i = 0; i < Math.min(unseen.length - 1, 1 + rivals.length * 2); i++) {
      const j = i + Math.floor(random() * (unseen.length - i));
      [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
    }
    let at = 0;
    const best = (cards: Card[]) => {
      while (cards.length < 3) cards.push(unseen[at++]);
      const pair = bestPair(cards);
      return [cards[pair[0]], cards[pair[1]]];
    };
    const mine = state.picks[me] ? handOf(state, me) : best(state.hands[me].slice());
    const verdict = showdown([
      { seat: -1, cards: mine },
      ...showing.map((c, k) => ({ seat: k, cards: best([c]) })),
    ]);
    score += verdict.winners.includes(-1) ? (verdict.rematch ? 0.5 : 1) : 0;
  }
  return score / samples;
}

/** The strongest two of three cards. */
const bestOf = (cards: readonly Card[]) => bestPair(cards).map((k) => cards[k]);
export const seotda: BettingGame<State> = {
  create: (opponents, variant) => createSession(opponents, (variant as Variant) ?? "two"),
  start,
  act,
  choose,
  phase: (s) => s.phase,
  turn: (s) => (s.phase === "betting" ? s.betting.turn : -1),
  options: (s) => (s.phase === "betting" ? options(s.betting) : null),
  round: (s) => s.round,
  won: (s) => s.won,
  stage: (s) =>
    s.phase !== "betting"
      ? ""
      : s.variant === "three"
        ? s.second
          ? "세 번째 패 베팅"
          : "첫 베팅"
        : s.betting.high > 0
          ? "베팅 중"
          : "베팅 시작",
  prompt(s) {
    const kind = choices(s);
    if (!kind) return null;
    const cards = s.hands[0];
    return kind === "show"
      ? {
          title: "상대에게 공개할 패를 고르세요",
          options: cards.map((c, i) => ({ label: `${cardText(c)} 공개`, value: i, cards: [c.id] })),
        }
      : {
          title: "족보로 쓸 두 장을 고르세요",
          options: PAIRS.map(([a, b], i) => ({
            label: `${cardText(cards[a])} · ${cardText(cards[b])} — ${rank([cards[a], cards[b]]).name}`,
            value: i,
            cards: [cards[a].id, cards[b].id],
          })),
        };
  },
  view(s) {
    const over = s.phase === "handOver" || s.phase === "sessionOver",
      settled = over && !s.result?.rematch;
    return {
      // Once the pot has been paid it is no longer on the table.
      pot: settled ? 0 : pot(s.betting),
      seats: s.betting.seats.map((seat, i) => {
        const cards = s.hands[i],
          // Others' cards open only at a showdown they reached.
          revealed = over && s.result?.shown[i] != null,
          net = s.result?.net[i] ?? 0,
          tone: Tone = settled ? (net > 0 ? "win" : net < 0 ? "lose" : "push") : "neutral",
          decided = s.variant === "two" || !!s.picks[i];
        return {
          name: NAMES[i],
          chips: seat.chips,
          bet: seat.total,
          active: s.phase === "betting" && s.betting.turn === i,
          folded: seat.folded,
          out: seat.out && !cards.length,
          tone,
          note: seat.folded
            ? "다이"
            : (i === 0 || revealed) && cards.length >= 2 && decided
              ? rank(handOf(s, i)).name
              : i === 0 && cards.length >= 2
                ? // Not chosen yet: the best hand my cards can make so far.
                  rank(cards.length > 2 ? bestOf(cards) : cards).name
              : seat.allIn && cards.length
                ? "올인"
                : "",
          cards: cards.map((c, k) => {
            // A folded hand lies face down, mine included.
            const open = !seat.folded && (i === 0 || revealed || (s.variant === "three" && s.open[i] === k));
            return {
              id: c.id,
              face: open ? faceOf(c) : null,
              text: open ? cardText(c) : "",
              secret: i === 0 && !seat.folded && !over && s.variant === "three" && s.open[0] !== null && s.open[0] !== k,
              peek: i === 0 && k === 2 && !seat.folded && !over,
            };
          }),
        };
      }),
    };
  },
  result(s) {
    const r = s.result;
    if (!r) return null;
    return {
      rematch: !!r.rematch,
      headline: r.rematch
        ? `${r.reason}: 판돈 ${pot(s.betting).toLocaleString("ko-KR")}을 두고 다시 겨룹니다.`
        : `${r.winners.map((i) => NAMES[i]).join(", ")} 승리 — ${r.reason}`,
      rows: s.betting.seats.flatMap((seat, i) =>
        seat.total > 0 || r.net[i] !== 0
          ? [{ name: NAMES[i], hand: r.shown[i] ?? (seat.folded ? "다이" : "—"), net: r.net[i] }]
          : [],
      ),
    };
  },
  decide(s, difficulty, seed) {
    const b = s.betting,
      choice = options(b)!,
      rivals = b.seats.filter((seat, i) => i !== b.turn && !seat.folded && !seat.out).length,
      salt = seed + s.round * 7919 + b.turn * 104729 + b.raises * 31 + (s.second ? 613 : 0),
      chance =
        s.variant === "three"
          ? equityThree(s, 150, salt)
          : equity(s.hands[b.turn]) ** Math.max(1, rivals);
    return wager(chance, choice, pot(b), difficulty, salt);
  },
};
