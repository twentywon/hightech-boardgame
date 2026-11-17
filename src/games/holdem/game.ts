import { pot } from "../cards/betting";
import type { BettingGame, Decision, Sizing, Tone } from "../cards/game";
import { decide } from "./ai";
import {
  act,
  createSession,
  handOf,
  options,
  start,
  STEP,
  STREETS,
  type Card,
  type State,
} from "./rules";

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
export const faceOf = (c: Card) => `${c.rank}${c.suit}`;
export const cardText = (c: Card) => `${c.rank}${SUIT[c.suit]}`;
export const NAMES = ["나", "컴퓨터 1", "컴퓨터 2", "컴퓨터 3", "컴퓨터 4", "컴퓨터 5"];
const chips = (n: number) => n.toLocaleString("ko-KR");

/**
 * The sizes a raise may take now, in chips put in: the smallest raise, then parts of the pot as it would stand
 * after calling, each rounded to a chip; all of them short of going all in (which has its own button).
 */
export function raiseSizes(s: State): Sizing | null {
  if (s.phase !== "betting") return null;
  const t = s.table,
    choice = options(t);
  if (!choice || choice.raise === null || choice.allIn === null) return null;
  const after = pot(t) + choice.call,
    least = choice.raise,
    wanted = [0.33, 0.5, 0.75, 1, 1.5, 2, 3, 5].map((part) => choice.call + Math.round((after * part) / STEP) * STEP),
    amounts = [...new Set([least, ...wanted.filter((a) => a > least)])].filter((a) => a < choice.allIn!).sort((a, b) => a - b),
    // Offered first: about two thirds of the pot, or the smallest raise when that is more.
    aim = choice.call + after * 0.66;
  let start = 0;
  amounts.forEach((a, i) => {
    if (Math.abs(a - aim) < Math.abs(amounts[start] - aim)) start = i;
  });
  // Before the flop the blinds are a bet already, so any raise is a raise; after it the first is a bet.
  return { word: s.street > 0 && t.high === 0 ? "베팅" : "레이즈", amounts, start };
}

export const holdem: BettingGame<State, Decision> = {
  create: (opponents) => createSession(opponents),
  start,
  act,
  choose: () => null,
  prompt: () => null,
  phase: (s) => s.phase,
  turn: (s) => (s.phase === "betting" ? s.table.turn : -1),
  options: (s) => (s.phase === "betting" ? options(s.table) : null),
  sizing: raiseSizes,
  round: (s) => s.round,
  won: (s) => s.won,
  stage: (s) => (s.phase === "betting" ? `${STREETS[s.street]} · 블라인드 ${chips(s.table.blinds[0])}/${chips(s.table.blinds[1])}` : ""),
  view(s) {
    const over = s.phase === "handOver" || s.phase === "sessionOver",
      t = s.table;
    return {
      // Once the pot has been paid it is no longer on the table.
      pot: over ? 0 : pot(t),
      dealer: s.button >= 0 ? s.button : undefined,
      board: s.board.map((c) => ({ id: c.id, face: faceOf(c), text: cardText(c) })),
      seats: t.seats.map((seat, i) => {
        const cards = s.hands[i],
          // The others' cards open only at a showdown they reached.
          revealed = over && s.result?.shown[i] != null,
          net = s.result?.net[i] ?? 0,
          tone: Tone = over ? (net > 0 ? "win" : net < 0 ? "lose" : "push") : "neutral",
          // A folded hand lies face down, mine included.
          open = !seat.folded && (i === 0 || revealed);
        return {
          name: NAMES[i],
          chips: seat.chips,
          bet: seat.total,
          active: s.phase === "betting" && t.turn === i,
          folded: seat.folded,
          out: seat.out && !cards.length,
          tone,
          note: seat.folded
            ? "폴드"
            : open && cards.length
              ? handOf(s, i).detail
              : over
                ? ""
                : seat.last,
          cards: cards.map((c) => ({
            id: c.id,
            face: open ? faceOf(c) : null,
            text: open ? cardText(c) : "",
            // My two cards are mine alone until a showdown.
            secret: i === 0 && open && !over,
          })),
        };
      }),
    };
  },
  result(s) {
    const r = s.result;
    if (!r) return null;
    const names = r.winners.map((i) => NAMES[i]).join(", "),
      split = r.showdown && r.pots[0] && r.pots[0].winners.length > 1,
      best = r.showdown ? r.shown[r.winners[0]] : null;
    return {
      rematch: false,
      headline: split
        ? `${names} 판돈을 나눕니다 — ${best}`
        : `${names} 승리 — ${best ?? "모두 폴드"}`,
      rows: s.table.seats.flatMap((seat, i) =>
        seat.total > 0 || r.net[i] !== 0
          ? [{ name: NAMES[i], hand: r.shown[i] ?? (seat.folded ? "폴드" : "—"), net: r.net[i] }]
          : [],
      ),
    };
  },
  decide(s, difficulty, seed) {
    const t = s.table,
      salt = seed + s.round * 7919 + t.turn * 104729 + s.street * 613 + t.raises * 31 + s.board.length * 17;
    return decide(s, difficulty, salt);
  },
};
