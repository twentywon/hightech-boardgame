import type { Action } from "./betting";
import type { Difficulty } from "../../core/ai";
import type { Random } from "../../core/random";

export type Tone = "neutral" | "win" | "lose" | "push";
/** A card as seat 0 may see it: `face` and `text` are empty while it is hidden. */
export interface CardView {
  id: number;
  face: string | null;
  text: string;
  /** Seat 0's own card that the other seats cannot see. */
  secret?: boolean;
  /** Seat 0's card dealt face down, which the person uncovers by hand. */
  peek?: boolean;
  /** Set by the table screen while such a card is still covered. */
  covered?: boolean;
}
/** A choice seat 0 must make before play continues. */
export interface Prompt {
  title: string;
  /** `cards` are the ids of seat 0's cards that stand for the option on the table. */
  options: { label: string; value: number; cards?: number[] }[];
}
export interface SeatView {
  name: string;
  chips: number;
  cards: CardView[];
  /** Chips this seat has in the pot this hand. */
  bet: number;
  /** Hand name, "다이", "올인" and the like; empty when nothing may be said. */
  note: string;
  tone: Tone;
  active: boolean;
  folded: boolean;
  out: boolean;
}
export interface TableView {
  seats: SeatView[];
  pot: number;
  /** Cards dealt face up in the middle for every seat to use (hold'em); games without them leave it out. */
  board?: CardView[];
  /** The seat with the dealer button, in games that pass one round the table. */
  dealer?: number;
}
export interface ResultView {
  headline: string;
  rows: { name: string; hand: string; net: number }[];
  /** The pot stays for a replay. */
  rematch: boolean;
}
export type Phase = "idle" | "choosing" | "betting" | "handOver" | "sessionOver";
/** A betting choice with the chips a raise puts in now, for games where a raise may be of any size. */
export interface Decision {
  action: Action;
  amount?: number;
}
/** The sizes a raise may take, offered to seat 0 smallest first (chips put in now). */
export interface Sizing {
  /** What the raise is called now, such as "베팅" with nothing bet yet and "레이즈" after a bet. */
  word: string;
  amounts: number[];
  /** Index of the size offered first. */
  start: number;
}
/**
 * What the shared table screen needs from a betting card game. Seat 0 is the
 * person; the other seats are played by `decide`.
 */
export interface BettingGame<S, D extends Action | Decision = Action> {
  create(opponents: number, variant?: string): S;
  start(state: S, random: Random): S | null;
  /** `amount` is what a raise puts in now, for games with `sizing`; others leave it out. */
  act(state: S, action: Action, amount?: number): S | null;
  phase(state: S): Phase;
  /** The choice seat 0 has to make now, when the phase is "choosing". */
  prompt(state: S): Prompt | null;
  choose(state: S, value: number): S | null;
  /** Seat to act, or -1. */
  turn(state: S): number;
  options(state: S): { fold: boolean; call: number; raise: number | null; allIn: number | null } | null;
  /** The table as seat 0 may see it; hidden cards carry no face or text. */
  view(state: S): TableView;
  /** Short description of the current step, such as the betting round. */
  stage(state: S): string;
  result(state: S): ResultView | null;
  /** True when seat 0 took every chip, false when it lost them, else null. */
  won(state: S): boolean | null;
  round(state: S): number;
  decide(state: S, difficulty: Difficulty, seed: number): D;
  /** No-limit games: the sizes seat 0 may raise by now, or null when it may not raise. */
  sizing?(state: S): Sizing | null;
}
export const NAMES = ["나", "컴퓨터 1", "컴퓨터 2", "컴퓨터 3"];
