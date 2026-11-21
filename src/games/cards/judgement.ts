import { seededRandom, type Difficulty } from "../../core/ai";
import type { Action } from "./betting";

/** How a computer seat turns its chance of winning into a bet. */
interface Temper {
  /** How far its reading of the hand can be off. */
  blur: number;
  /** Chance of betting a weak hand as if it were strong. */
  bluff: number;
  /** Below 1 it calls with less than the price justifies. */
  price: number;
  /** Pushes all in with a near-certain hand. */
  shoves: boolean;
}
export const tempers: Record<Difficulty, Temper> = {
  beginner: { blur: 0.3, bluff: 0, price: 0.45, shoves: false },
  easy: { blur: 0.18, bluff: 0, price: 0.7, shoves: false },
  normal: { blur: 0.08, bluff: 0.04, price: 0.9, shoves: false },
  hard: { blur: 0.03, bluff: 0.07, price: 1, shoves: true },
  expert: { blur: 0, bluff: 0.1, price: 1.05, shoves: true },
};
/**
 * Chooses a betting action from the chance of winning the showdown.
 * `equity` is that chance against every seat still in; the choice weighs it
 * against the price of calling.
 */
export function wager(
  equity: number,
  choice: { call: number; raise: number | null; allIn: number | null },
  potNow: number,
  difficulty: Difficulty,
  seed: number,
): Action {
  const temper = tempers[difficulty],
    random = seededRandom(seed),
    // Two uniform draws make a bell-shaped error around the true value.
    read = Math.min(1, Math.max(0, equity + (random() + random() - 1) * temper.blur)),
    bluffing = random() < temper.bluff;
  if (choice.call === 0) {
    if ((read > 0.62 || bluffing) && choice.raise !== null) return "raise";
    return "call";
  }
  const price = choice.call / (potNow + choice.call);
  if (temper.shoves && read > 0.93 && choice.allIn !== null) return "allIn";
  if (read > 0.8 && choice.raise !== null) return "raise";
  if (read >= price * temper.price) return "call";
  if (bluffing && choice.raise !== null) return "raise";
  return "fold";
}
