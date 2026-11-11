import { seededRandom, type Difficulty } from "../../core/ai";
import {
  BONUS_AT,
  CATEGORIES,
  UPPER,
  hasRolled,
  openCategories,
  scoreFor,
  totals,
  type Card,
  type Category,
  type State,
} from "./rules";

/** What to do next: keep these dice and roll again, or write a category. */
export interface Advice {
  hold: boolean[] | null;
  category: Category | null;
}

// Every distinct hand of five dice, faces ascending: 252 of them.
const HANDS: number[][] = [];
const HAND_INDEX = new Map<string, number>();
(function build(prefix: number[], from: number) {
  if (prefix.length === 5) {
    HAND_INDEX.set(prefix.join(""), HANDS.length);
    HANDS.push(prefix);
    return;
  }
  for (let face = from; face <= 6; face++) build([...prefix, face], face);
})([], 1);
const FACTORIAL = [1, 1, 2, 6, 24, 120];
/** Distinct results of throwing k dice, with their probabilities. */
const THROWS: { faces: number[]; p: number }[][] = [];
for (let k = 0; k <= 5; k++) {
  const list: { faces: number[]; p: number }[] = [];
  (function build(prefix: number[], from: number) {
    if (prefix.length === k) {
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (const f of prefix) c[f]++;
      let ways = FACTORIAL[k];
      for (const n of c) ways /= FACTORIAL[n];
      list.push({ faces: prefix, p: ways / 6 ** k });
      return;
    }
    for (let face = from; face <= 6; face++) build([...prefix, face], face);
  })([], 1);
  THROWS.push(list);
}
/** Where keeping `kept` and rethrowing the rest can lead: hand indexes and odds. */
const reach = new Map<string, { hand: Int16Array; p: Float64Array }>();
function outcomes(kept: number[]) {
  const key = kept.join("");
  let entry = reach.get(key);
  if (!entry) {
    const list = THROWS[5 - kept.length];
    entry = { hand: new Int16Array(list.length), p: new Float64Array(list.length) };
    list.forEach((t, i) => {
      entry!.hand[i] = HAND_INDEX.get([...kept, ...t.faces].sort().join(""))!;
      entry!.p[i] = t.p;
    });
    reach.set(key, entry);
  }
  return entry;
}
/** Every distinct selection of dice to keep from each hand. */
const KEEPS: number[][][] = HANDS.map((hand) => {
  const seen = new Map<string, number[]>();
  for (let mask = 0; mask < 32; mask++) {
    const kept = hand.filter((_, i) => mask & (1 << i));
    seen.set(kept.join(""), kept);
  }
  return [...seen.values()];
});

// What a category is usually worth when left for later.
const PAR: Record<Category, number> = {
  ones: 2.5,
  twos: 5,
  threes: 7.5,
  fours: 10,
  fives: 12.5,
  sixes: 15,
  choice: 21,
  fourKind: 9,
  fullHouse: 13,
  smallStraight: 11,
  largeStraight: 12,
  yacht: 6,
};
interface Profile {
  /** Looks ahead through the remaining rolls instead of following a rule of thumb. */
  plans: boolean;
  /** Weighs a score against what the category could still earn. */
  weighs: boolean;
  /** Lets that weight fade as the game runs out and tracks the bonus. */
  paces: boolean;
  /** Chance of a careless choice. */
  slip: number;
}
export const profiles: Record<Difficulty, Profile> = {
  beginner: { plans: false, weighs: false, paces: false, slip: 0.35 },
  easy: { plans: false, weighs: false, paces: false, slip: 0 },
  normal: { plans: true, weighs: false, paces: false, slip: 0 },
  hard: { plans: true, weighs: true, paces: false, slip: 0 },
  expert: { plans: true, weighs: true, paces: true, slip: 0 },
};

/** Worth of writing `dice` into `category`, by this profile's judgement. */
function worth(card: Card, open: Category[], dice: number[], category: Category, profile: Profile) {
  const points = scoreFor(dice, category);
  if (!profile.weighs) return points;
  const fade = profile.paces ? (open.length - 1) / (CATEGORIES.length - 1) : 1;
  let value = points - PAR[category] * fade;
  const face = UPPER.indexOf(category) + 1;
  if (profile.paces && face > 0 && totals(card).upper < BONUS_AT)
    // Three of each face reaches the bonus: reward staying ahead of that pace.
    value += (points - 3 * face) * 0.6 * fade;
  return value;
}
function bestCategory(card: Card, dice: number[], profile: Profile) {
  const open = openCategories(card);
  let best = open[0],
    bestValue = -Infinity;
  for (const category of open) {
    const value = worth(card, open, dice, category, profile);
    if (value > bestValue) {
      bestValue = value;
      best = category;
    }
  }
  return { category: best, value: bestValue };
}
/** Marks the dice of `dice` that make up the multiset `kept`. */
function holdMask(dice: number[], kept: number[]) {
  const left = kept.slice();
  return dice.map((face) => {
    const at = left.indexOf(face);
    if (at < 0) return false;
    left.splice(at, 1);
    return true;
  });
}
/**
 * Decides the next step for the player to move. Looking ahead is exact: the
 * value of a hand with rolls left is the best expected value over every way
 * of keeping dice.
 */
export function advise(state: State, difficulty: Difficulty, seed = 1): Advice {
  if (state.over) return { hold: null, category: null };
  if (!hasRolled(state)) return { hold: null, category: null };
  const profile = profiles[difficulty],
    card = state.cards[state.turn],
    open = openCategories(card),
    random = seededRandom(seed + state.rollId * 7919 + state.round * 104729);
  if (profile.slip && random() < profile.slip && state.rollsLeft === 0)
    return { hold: null, category: open[Math.floor(random() * open.length)] };
  const stop = bestCategory(card, state.dice, profile);
  if (state.rollsLeft === 0) return { hold: null, category: stop.category };
  if (!profile.plans) {
    // Rule of thumb: keep the most common face (the higher on a tie), unless
    // the hand already scores well.
    if (scoreFor(state.dice, stop.category) >= 25) return { hold: null, category: stop.category };
    if (profile.slip && random() < profile.slip)
      return { hold: state.dice.map(() => random() < 0.5), category: null };
    let face = 0,
      most = 0;
    for (let f = 1; f <= 6; f++) {
      const n = state.dice.filter((d) => d === f).length;
      if (n >= most) {
        most = n;
        face = f;
      }
    }
    return { hold: state.dice.map((d) => d === face), category: null };
  }
  // Value of every hand once no roll is left, then one and two rolls earlier.
  let values = Float64Array.from(HANDS, (hand) => bestCategory(card, hand, profile).value);
  for (let ahead = 1; ahead < state.rollsLeft; ahead++) {
    const next = new Float64Array(HANDS.length);
    for (let h = 0; h < HANDS.length; h++) {
      let best = values[h];
      for (const kept of KEEPS[h]) {
        if (kept.length === 5) continue;
        const { hand, p } = outcomes(kept);
        let expected = 0;
        for (let i = 0; i < hand.length; i++) expected += p[i] * values[hand[i]];
        if (expected > best) best = expected;
      }
      next[h] = best;
    }
    values = next;
  }
  const sorted = state.dice.slice().sort(),
    h = HAND_INDEX.get(sorted.join(""))!;
  let bestKeep: number[] | null = null,
    bestValue = stop.value;
  for (const kept of KEEPS[h]) {
    if (kept.length === 5) continue;
    const { hand, p } = outcomes(kept);
    let expected = 0;
    for (let i = 0; i < hand.length; i++) expected += p[i] * values[hand[i]];
    if (expected > bestValue + 1e-9) {
      bestValue = expected;
      bestKeep = kept;
    }
  }
  return bestKeep
    ? { hold: holdMask(state.dice, bestKeep), category: null }
    : { hold: null, category: stop.category };
}
