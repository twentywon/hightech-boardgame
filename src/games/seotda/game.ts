import { options, pot } from "../cards/betting";
import { NAMES, type BettingGame, type Tone } from "../cards/game";
import { wager } from "../cards/judgement";
import {
  act,
  createDeck,
  createSession,
  rank,
  showdown,
  start,
  type Card,
  type State,
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

export const seotda: BettingGame<State> = {
  create: (opponents) => createSession(opponents),
  start,
  act,
  phase: (s) => s.phase,
  turn: (s) => (s.phase === "betting" ? s.betting.turn : -1),
  options: (s) => (s.phase === "betting" ? options(s.betting) : null),
  round: (s) => s.round,
  won: (s) => s.won,
  stage: (s) =>
    s.phase === "betting" ? (s.betting.high > 0 ? "베팅 중" : "베팅 시작") : "",
  view(s) {
    const over = s.phase === "handOver" || s.phase === "sessionOver";
    return {
      pot: pot(s.betting),
      seats: s.betting.seats.map((seat, i) => {
        const cards = s.hands[i],
          // Seat 0 always sees its own cards; others only at a showdown they reached.
          open = i === 0 || (over && s.result?.shown[i] != null),
          net = s.result?.net[i] ?? 0,
          tone: Tone =
            over && !s.result?.rematch ? (net > 0 ? "win" : net < 0 ? "lose" : "push") : "neutral";
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
            : open && cards.length === 2
              ? rank(cards).name
              : seat.allIn && cards.length
                ? "올인"
                : "",
          cards: seat.folded
            ? []
            : cards.map((c) => ({
                id: c.id,
                face: open ? faceOf(c) : null,
                text: open ? cardText(c) : "",
              })),
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
      chance = equity(s.hands[b.turn]) ** Math.max(1, rivals);
    return wager(chance, choice, pot(b), difficulty, seed + s.round * 7919 + b.turn * 104729 + b.raises * 31);
  },
};
