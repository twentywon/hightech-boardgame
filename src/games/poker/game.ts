import { seededRandom } from "../../core/ai";
import { createDeck } from "../blackjack/shoe";
import { options, pot } from "../cards/betting";
import { NAMES, type BettingGame, type Tone } from "../cards/game";
import { wager } from "../cards/judgement";
import { act, choose, createSession, evaluate, start, type Card, type State } from "./rules";

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
export const faceOf = (c: Card) => `${c.rank}${c.suit}`;
export const cardText = (c: Card) => `${c.rank}${SUIT[c.suit]}`;

/**
 * Chance that the seat to act wins a showdown against every seat still in,
 * estimated by dealing the unseen cards at random `samples` times. Only the
 * seat's own cards and the face-up cards are treated as known.
 */
export function equity(state: State, samples: number, seed: number) {
  const b = state.betting,
    me = b.turn,
    rivals = b.seats.flatMap((seat, i) => (i !== me && !seat.folded && !seat.out ? [i] : [])),
    known = new Set<string>(state.hands[me].map(faceOf));
  for (const i of rivals) for (const c of state.hands[i]) if (c.up) known.add(faceOf(c));
  const unseen = createDeck(1).filter((c) => !known.has(faceOf(c))),
    random = seededRandom(seed);
  let score = 0;
  for (let n = 0; n < samples; n++) {
    // A partial shuffle: only as many cards as the sample needs.
    const need = 7 - state.hands[me].length + rivals.length * 7;
    for (let i = 0; i < Math.min(need, unseen.length - 1); i++) {
      const j = i + Math.floor(random() * (unseen.length - i));
      [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
    }
    let at = 0;
    const fill = (cards: readonly Card[]) => {
      const hand = cards.slice();
      while (hand.length < 7) hand.push(unseen[at++]);
      return hand;
    };
    const mine = evaluate(fill(state.hands[me])).score;
    let best = -1;
    for (const i of rivals)
      best = Math.max(best, evaluate(fill(state.hands[i].filter((c) => c.up))).score);
    score += mine > best ? 1 : mine === best ? 0.5 : 0;
  }
  return score / samples;
}

export const poker: BettingGame<State> = {
  create: (opponents) => createSession(opponents),
  start,
  act,
  choose,
  prompt: (s) =>
    s.phase === "choosing"
      ? {
          title: "상대에게 공개할 카드를 고르세요",
          options: s.hands[0].map((c, i) => ({ label: `${cardText(c)} 공개`, value: i, cards: [c.id] })),
        }
      : null,
  phase: (s) => s.phase,
  turn: (s) => (s.phase === "betting" ? s.betting.turn : -1),
  options: (s) => (s.phase === "betting" ? options(s.betting) : null),
  round: (s) => s.round,
  won: (s) => s.won,
  stage: (s) => (s.phase === "betting" ? `${s.street}번째 카드 베팅` : ""),
  view(s) {
    const over = s.phase === "handOver" || s.phase === "sessionOver";
    return {
      // Once the pot has been paid it is no longer on the table.
      pot: over ? 0 : pot(s.betting),
      seats: s.betting.seats.map((seat, i) => {
        const cards = s.hands[i],
          // Face-down cards of other seats open only at a showdown they reached.
          revealed = over && s.result?.shown[i] != null,
          net = s.result?.net[i] ?? 0,
          tone: Tone = over ? (net > 0 ? "win" : net < 0 ? "lose" : "push") : "neutral";
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
            : (i === 0 || revealed) && cards.length
              ? evaluate(cards).name
              : seat.allIn && cards.length
                ? "올인"
                : "",
          cards: cards.map((c, k) => {
            // A folded hand lies face down, mine included.
            const open = !seat.folded && (c.up || i === 0 || revealed);
            return {
              id: c.id,
              face: open ? faceOf(c) : null,
              text: open ? cardText(c) : "",
              secret: i === 0 && !seat.folded && !c.up && !over && s.phase !== "choosing",
              // The seventh card arrives face down for the person to uncover.
              peek: i === 0 && k === 6 && !seat.folded && !over,
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
      rematch: false,
      headline: `${r.winners.map((i) => NAMES[i]).join(", ")} 승리 — ${r.reason}`,
      rows: s.betting.seats.flatMap((seat, i) =>
        seat.total > 0 || r.net[i] !== 0
          ? [{ name: NAMES[i], hand: r.shown[i] ?? (seat.folded ? "다이" : "—"), net: r.net[i] }]
          : [],
      ),
    };
  },
  decide(s, difficulty, seed) {
    const b = s.betting,
      salt = seed + s.round * 7919 + b.turn * 104729 + s.street * 613 + b.raises * 31;
    return wager(equity(s, 120, salt), options(b)!, pot(b), difficulty, salt);
  },
};
