import type { Move } from "../games/points/types";
import type { Action } from "../games/cards/betting";
import type { BettingGame, Decision } from "../games/cards/game";
import * as seotdaRules from "../games/seotda/rules";
import * as pokerRules from "../games/poker/rules";
import * as holdemRules from "../games/holdem/rules";
import { seotda } from "../games/seotda/game";
import { poker } from "../games/poker/game";
import { holdem } from "../games/holdem/game";
import { HOST_ONLY, NOBODY } from "./match";
import type { BoardNet } from "./boards";
import type { Seated } from "./screens";
import type { SeatKind, StartInfo } from "./protocol";

/**
 * The betting card games (seotda, seven poker, Texas hold'em) as a room plays them (와이파이 여럿이, the user asked).
 * Two to as many seats as the game seats at one screen; a seat after the second may be closed, and the game then has
 * as many players as seats taken, in the seats' order (`Seated.seats[p]` is player p's room seat). Seats the host
 * gives the computer, and the seat of a guest who dropped, are played by the host's computer (`standIn`).
 *
 * Every step is a move of the room's `{from, to, extra}`, played through the game's own rules on every device:
 *  - a deal (`from` DEAL), the host's device's alone (`HOST_ONLY`) between hands; the shuffle is the move's own
 *    random stream, which the host salts as it takes the move, so every device deals the same cards and nobody can
 *    foresee them;
 *  - a betting action (`from` ACT, `to` its index in `ACTIONS`, `extra` the chips of a no-limit raise or -1), by the
 *    seat to act, on its own device;
 *  - a choice (`from` CHOOSE, `to` its value): the card a seat shows, or the pair it plays (three-card seotda), made
 *    by each person in seat order (`chooser`).
 *
 * Hidden cards: the whole state, every hand in it, is on every device, and each device's screen shows only its own
 * hidden cards ("honest devices"). Someone who reads the page's memory could see the others' cards; the screens never
 * write them into the page before the showdown.
 */
export const BET = { deal: 0, act: 1, choose: 2 } as const;
export const ACTIONS: readonly Action[] = ["fold", "call", "raise", "allIn"];
export const dealMove = (): Move => ({ from: BET.deal, to: -1, extra: -1 });
export const actMove = (action: Action, amount?: number): Move => ({ from: BET.act, to: ACTIONS.indexOf(action), extra: amount ?? -1 });
export const chooseMove = (value: number): Move => ({ from: BET.choose, to: value, extra: -1 });

export interface BettingNet<S> extends BoardNet<Seated<S>> {
  /** The game's own rules for the shared table screen. */
  readonly rules: BettingGame<S, Action | Decision>;
  /** The game's player who chooses now, or -1. */
  chooser(state: S): number;
  /** The move the host's computer makes for the seat to move (a computer's, or a person's who dropped). */
  standIn(state: Seated<S>): Move | null;
}
const COMPUTER: SeatKind[] = ["computer"],
  AFTER_SECOND: SeatKind[] = ["computer", "closed"];
const COLORS = ["#c23b2b", "#2f5fa8", "#2f8a4f", "#d9a521", "#8a4ec2", "#2c2c30"];
const seatList = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `${i + 1}번 자리`, color: COLORS[i], kinds: i < 2 ? COMPUTER : AFTER_SECOND }));
/** The players of a game a room starts (every seat not closed, in order) and which of them are people. */
function players(start: StartInfo) {
  const seats = start.seats.flatMap((t, i) => (t.kind === "closed" ? [] : [i])),
    people = seats.flatMap((seat, p) => (start.seats[seat].kind === "person" ? [p] : []));
  return { seats, people };
}
const int = (n: number) => Number.isInteger(n);

function bettingNet<S>(spec: {
  game: string;
  seats: number;
  rules: BettingGame<S, Action | Decision>;
  create(players: number, people: number[], start: StartInfo): S;
  chooser(state: S): number;
  /** The choice the rules' own judgement makes for the seat choosing. */
  choice(state: S, player: number): number;
  /** The chips a player holds. */
  chips(state: S, player: number): number;
}): BettingNet<S> {
  const { rules } = spec;
  const play = (state: S, move: Move, random: () => number): S | null => {
    switch (move.from) {
      case BET.deal:
        return move.to === -1 && move.extra === -1 ? rules.start(state, random) : null;
      case BET.act: {
        const action = ACTIONS[move.to];
        if (!action || !int(move.extra) || (move.extra !== -1 && (move.extra < 0 || action !== "raise" || !rules.sizing))) return null;
        return rules.act(state, action, move.extra >= 0 ? move.extra : undefined);
      }
      case BET.choose:
        return int(move.to) && move.extra === -1 && rules.phase(state) === "choosing" ? rules.choose(state, move.to) : null;
    }
    return null;
  };
  /** The player to move, -1 between hands, -2 when the session is over. */
  const playerToMove = (s: S) => {
    const phase = rules.phase(s);
    if (phase === "betting") return rules.turn(s);
    if (phase === "choosing") return spec.chooser(s);
    return phase === "sessionOver" ? -2 : -1;
  };
  return {
    game: spec.game,
    rules,
    seats: seatList(spec.seats),
    chooser: spec.chooser,
    create(start) {
      const { seats, people } = players(start);
      return { seats, game: spec.create(seats.length, people, start) };
    },
    play(state, move, random) {
      const game = play(state.game, move, random);
      return game && { seats: state.seats, game };
    },
    toMove(s) {
      const p = playerToMove(s.game);
      return p === -2 ? NOBODY : p === -1 ? HOST_ONLY : (s.seats[p] ?? NOBODY);
    },
    result(s) {
      if (rules.phase(s.game) !== "sessionOver") return null;
      const holding = s.seats.flatMap((seat, p) => (spec.chips(s.game, p) > 0 ? [seat] : []));
      return holding.length === 1 ? holding[0] : "draw";
    },
    standIn(s) {
      const g = s.game,
        phase = rules.phase(g);
      if (phase === "choosing") {
        const p = spec.chooser(g);
        return p < 0 ? null : chooseMove(spec.choice(g, p));
      }
      if (phase !== "betting") return null;
      const seat = rules.turn(g),
        decision = rules.decide(g, "normal", 1 + rules.round(g) * 31 + seat),
        wanted = typeof decision === "string" ? actMove(decision) : actMove(decision.action, decision.action === "raise" && rules.sizing ? decision.amount : undefined);
      // A refused choice must not stall the table.
      for (const move of [wanted, actMove("call"), actMove("fold")]) if (play(g, move, () => 0.5)) return move;
      return null;
    },
  };
}

export const seotdaNet = bettingNet<seotdaRules.State>({
  game: "seotda",
  seats: 4,
  rules: seotda,
  create: (n, people, start) => seotdaRules.createSession(n - 1, start.options.variant === "three" ? "three" : "two", people),
  chooser: seotdaRules.chooser,
  choice(s, p) {
    const cards = s.hands[p];
    if (seotdaRules.choices(s) === "show") return seotdaRules.shown(cards);
    const best = seotdaRules.bestPair(cards);
    return seotdaRules.PAIRS.findIndex(([a, b]) => a === best[0] && b === best[1]);
  },
  chips: (s, p) => s.betting.seats[p]?.chips ?? 0,
});
export const pokerNet = bettingNet<pokerRules.State>({
  game: "seven-poker",
  seats: 4,
  rules: poker,
  create: (n, people) => pokerRules.createSession(n - 1, people),
  chooser: pokerRules.chooser,
  choice: (s, p) => pokerRules.shown(s.hands[p].slice(0, 3)),
  chips: (s, p) => s.betting.seats[p]?.chips ?? 0,
});
export const holdemNet = bettingNet<holdemRules.State>({
  game: "texas-holdem",
  seats: holdemRules.MAX_OPPONENTS + 1,
  rules: holdem,
  create: (n, people) => holdemRules.createSession(n - 1, people),
  chooser: () => -1,
  choice: () => -1,
  chips: (s, p) => s.table.seats[p]?.chips ?? 0,
});
/** The room rules of a betting game by its id. */
export const BETTING_NETS: Record<string, BettingNet<unknown>> = {
  seotda: seotdaNet as BettingNet<unknown>,
  "seven-poker": pokerNet as BettingNet<unknown>,
  "texas-holdem": holdemNet as BettingNet<unknown>,
};
