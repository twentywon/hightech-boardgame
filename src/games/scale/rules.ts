import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The balance quiz (저울 퀴즈, the user asked for it with four kinds of old
 * balance puzzles, each laid at random, like the stages of river crossing):
 *
 * 1. Coins: one coin of many is false; find it with the scale used only so
 *    many times. The false coin is never fixed in advance: each weighing
 *    falls the way that leaves the most coins in doubt, so only a sure
 *    answer wins.
 * 2. Weights: a parcel stands on the left pan; set brass weights on either
 *    pan until the scale is level.
 * 3. Goods: several scales stand level with goods and weights on their pans;
 *    give each kind of goods its weight so that every scale is level again.
 * 4. Mobile: a hanging mobile of rods and weights, some weights unknown;
 *    give them the weights that make every rod hang level.
 *
 * Every puzzle laid has one answer only (searched when it is laid).
 */
export type Kind = "coins" | "weights" | "goods" | "mobile";
export const KINDS: Kind[] = ["coins", "weights", "goods", "mobile"];
/**
 * Moves besides a tap on a coin or a weight (its own index, which moves it on: left pan, right pan, off): weigh, start or
 * stop naming the false coin, turn a dial up or down, set it, and put a coin or weight where it is dragged (`putOn`).
 */
export const WEIGH = 900,
  ACCUSE = 901,
  /** The goods' and the mobile's answer handed in: the dials say nothing until then (the user asked). */
  CHECK = 902,
  UP = 1000,
  DOWN = 1100,
  SET = 2000,
  PUT = 3000;
export const setTo = (dial: number, value: number) => SET + dial * 64 + value;
/** A coin or weight set down off the scale (0), on the left pan (1) or on the right (2). */
export const putOn = (item: number, pan: number) => PUT + item * 3 + pan;
/** The coin or weight and the place of a `putOn` move, or null for any other. */
export const putOf = (to: number) => (to >= PUT ? { item: Math.floor((to - PUT) / 3), pan: (to - PUT) % 3 } : null);
/** A weighing made: the coins on each pan and which way the beam fell (1 the left pan down, −1 the right, 0 level). */
export interface Weighing {
  left: number[];
  right: number[];
  tip: -1 | 0 | 1;
}
/** On a pan of the goods' scales: a kind of goods (0–3), or a weight of `100 + n`. */
export const WEIGHT = 100;
export interface Pans {
  left: number[];
  right: number[];
}
export interface Leaf {
  leaf: number;
}
export interface Rod {
  /** Arm lengths, in steps, to the left and right ends. */
  a: number;
  b: number;
  left: Node;
  right: Node;
}
export type Node = Leaf | Rod;
export const isLeaf = (node: Node): node is Leaf => "leaf" in node;
/** The parcels of the weights' stage and the goods of the third, by name and colour. */
export const SPICES: [string, string][] = [
  ["커민", "#9a6a34"],
  ["강황", "#e0a31c"],
  ["사프란", "#d8541c"],
  ["수막", "#9c2a3a"],
  ["카다멈", "#7f9a4a"],
  ["장미 꽃잎", "#d76b8c"],
];
export const GOODS = ["석류", "레몬", "무화과", "오이"];
export interface State {
  kind: Kind;
  /** Which puzzle this is, for the table to know when to lay a new one. */
  key: number;
  /** Coins: how many, whether the false one is heavier (1), lighter (−1) or either (0), the weighings allowed and made. */
  coins: number;
  heavy: -1 | 0 | 1;
  allowed: number;
  log: Weighing[];
  accusing: boolean;
  /** The false coin, told once the game is over. */
  fake: number | null;
  /** Where each coin or weight lies: 0 off the scale, 1 on the left pan, 2 on the right. */
  pans: number[];
  /** Weights: the parcel's weight and its spice, and the weights there are. */
  load: number;
  spice: number;
  weights: number[];
  /** Goods: their scales, and how many kinds there are. */
  scales: Pans[];
  /** Mobile: its rods, and every leaf's true weight; `hidden` lists the leaves shown with a dial. */
  mobile: Rod | null;
  leaves: number[];
  hidden: number[];
  /** The dials (the goods' weights, or the hidden leaves'), their answer and their top. */
  guess: number[];
  answer: number[];
  max: number;
  trouble: string;
  winner: Winner;
  last: { to: number } | null;
  ply: number;
}
const blank = (): Omit<State, "kind" | "key"> => ({
  coins: 0,
  heavy: 0,
  allowed: 0,
  log: [],
  accusing: false,
  fake: null,
  pans: [],
  load: 0,
  spice: 0,
  weights: [],
  scales: [],
  mobile: null,
  leaves: [],
  hidden: [],
  guess: [],
  answer: [],
  max: 12,
  trouble: "",
  winner: null,
  last: null,
  ply: 0,
});
const pick = <X>(random: Random, list: X[]) => list[Math.floor(random() * list.length) % list.length];
const between = (random: Random, low: number, high: number) => low + (Math.floor(random() * (high - low + 1)) % (high - low + 1));

/* ---------------------------------------------------------------- coins */

type Doubt = [coin: number, way: 1 | -1];
const predict = (w: Pick<Weighing, "left" | "right">, coin: number, way: number) => (w.left.includes(coin) ? way : w.right.includes(coin) ? -way : 0);
/** Whether a weighing could tell anything: as many coins on each pan (more on one side only weighs it down). */
export const fair = (w: Pick<Weighing, "left" | "right">) => w.left.length === w.right.length;
/** Every (coin, heavier or lighter) the weighings so far leave possible; a weighing of unequal numbers rules nothing out. */
export function doubts(s: Pick<State, "coins" | "heavy" | "log">): Doubt[] {
  let out: Doubt[] = [];
  for (let c = 0; c < s.coins; c++) {
    if (s.heavy !== -1) out.push([c, 1]);
    if (s.heavy !== 1) out.push([c, -1]);
  }
  for (const w of s.log) if (fair(w)) out = out.filter(([c, d]) => predict(w, c, d) === w.tip);
  return out;
}
/** The coins that may still be the false one. */
export const suspects = (s: Pick<State, "coins" | "heavy" | "log">) => [...new Set(doubts(s).map(([c]) => c))];
interface Classes {
  /** Coins that may be heavier or lighter, only heavier, only lighter, and known to be true. */
  u: number[];
  h: number[];
  l: number[];
  g: number[];
}
function classes(coins: number, list: Doubt[]): Classes {
  const out: Classes = { u: [], h: [], l: [], g: [] };
  for (let c = 0; c < coins; c++) {
    const heavy = list.some(([x, d]) => x === c && d === 1),
      light = list.some(([x, d]) => x === c && d === -1);
    (heavy && light ? out.u : heavy ? out.h : light ? out.l : out.g).push(c);
  }
  return out;
}
/** How many coins of each class go on each pan. */
interface Plan {
  u1: number;
  h1: number;
  l1: number;
  g1: number;
  u2: number;
  h2: number;
  l2: number;
  g2: number;
}
const plans = new Map<string, Plan | true | null>();
/** A weighing that makes sure of the false coin within `k` weighings from coins in these classes, or true when it is already sure, or null. */
function search(u: number, h: number, l: number, g: number, k: number): Plan | true | null {
  if (u + h + l <= 1) return true;
  if (k <= 0 || u + h + l > 3 ** k) return null;
  g = Math.min(g, 14);
  const key = `${u},${h},${l},${g},${k}`;
  if (plans.has(key)) return plans.get(key)!;
  let found: Plan | null = null;
  outer: for (let u1 = 0; u1 <= u; u1++)
    for (let u2 = 0; u1 + u2 <= u; u2++)
      for (let h1 = 0; h1 <= h; h1++)
        for (let h2 = 0; h1 + h2 <= h; h2++)
          for (let l1 = 0; l1 <= l; l1++)
            for (let l2 = 0; l1 + l2 <= l; l2++) {
              const a = u1 + h1 + l1,
                b = u2 + h2 + l2,
                g1 = Math.max(0, b - a),
                g2 = Math.max(0, a - b);
              if (g1 + g2 > g || a + g1 === 0) continue;
              const left = search(0, h1 + u1, l2 + u2, g, k - 1),
                right = left && search(0, h2 + u2, l1 + u1, g, k - 1),
                level = right && search(u - u1 - u2, h - h1 - h2, l - l1 - l2, g + a + b, k - 1);
              if (left && right && level) {
                found = { u1, h1, l1, g1, u2, h2, l2, g2 };
                break outer;
              }
            }
  plans.set(key, found);
  return found;
}
const counted = (c: Classes) => [c.u.length, c.h.length, c.l.length, c.g.length] as const;
/** Whether the false coin can still be made sure of with the weighings left. */
export function solvable(s: State) {
  return search(...counted(classes(s.coins, doubts(s))), s.allowed - s.log.length) !== null;
}
/** The coins on each pan now. */
export const onPans = (s: Pick<State, "pans">) => ({ left: s.pans.flatMap((p, i) => (p === 1 ? [i] : [])), right: s.pans.flatMap((p, i) => (p === 2 ? [i] : [])) });
/** The scale may be weighed whatever lies on it (the user asked), as long as weighings are left. */
const weighable = (s: State) => !s.accusing && s.log.length < s.allowed;
/** A weighing worth making: as many coins on each pan, and some. */
const telling = (s: State) => {
  const { left, right } = onPans(s);
  return weighable(s) && left.length > 0 && left.length === right.length;
};
/** Which way the beam falls: the way that leaves the most coins (and then the most cases) in doubt. */
function fall(s: State, w: Pick<Weighing, "left" | "right">): -1 | 0 | 1 {
  const list = doubts(s);
  let best: -1 | 0 | 1 = 0,
    score = -1;
  for (const tip of [0, 1, -1] as const) {
    const left = list.filter(([c, d]) => predict(w, c, d) === tip),
      value = new Set(left.map(([c]) => c)).size * 100 + left.length;
    if (left.length && value > score) {
      score = value;
      best = tip;
    }
  }
  return best;
}
function coinsGame(random: Random): Omit<State, "key"> {
  // Three kinds, drawn at random: few coins and two weighings, the false one's weight told; up to 27 and three; or the old twelve, heavier or lighter unknown.
  const family = between(random, 0, 2),
    [coins, allowed, heavy] =
      family === 0 ? [between(random, 6, 9), 2, pick(random, [1, -1])] : family === 1 ? [between(random, 13, 27), 3, pick(random, [1, -1])] : [between(random, 10, 12), 3, 0];
  return { ...blank(), kind: "coins", coins, allowed, heavy: heavy as -1 | 0 | 1, pans: new Array(coins).fill(0) };
}
function coinHint(s: State): Move | null {
  const sure = suspects(s);
  if (sure.length === 1) return { from: -1, to: s.accusing ? sure[0] : ACCUSE, extra: -1 };
  if (s.accusing) return { from: -1, to: ACCUSE, extra: -1 };
  const k = s.allowed - s.log.length,
    list = doubts(s);
  // The coins on the pans now make a good weighing: weigh.
  if (telling(s)) {
    const now = onPans(s),
      good = ([1, -1, 0] as const).every((tip) => {
        const left = list.filter(([c, d]) => predict(now, c, d) === tip);
        return !left.length || search(...counted(classes(s.coins, left)), k - 1) !== null;
      });
    if (good) return { from: -1, to: WEIGH, extra: -1 };
  }
  const c = classes(s.coins, list),
    plan = search(...counted(c), k);
  if (!plan || plan === true) return null;
  const want = new Array(s.coins).fill(0),
    put = (from: number[], first: number, second: number) => {
      from.slice(0, first).forEach((x) => (want[x] = 1));
      from.slice(first, first + second).forEach((x) => (want[x] = 2));
    };
  put(c.u, plan.u1, plan.u2);
  put(c.h, plan.h1, plan.h2);
  put(c.l, plan.l1, plan.l2);
  put(c.g, plan.g1, plan.g2);
  const coin = want.findIndex((p, i) => p !== s.pans[i]);
  return coin < 0 ? { from: -1, to: WEIGH, extra: -1 } : { from: -1, to: putOn(coin, want[coin]), extra: -1 };
}

/* -------------------------------------------------------------- weights */

/** Every way of setting the weights (0 off, 1 beside the parcel, 2 on the other pan) that levels the scale. */
export function levellings(load: number, weights: number[]) {
  const out: number[][] = [];
  const walk = (i: number, at: number[], left: number, right: number) => {
    if (i === weights.length) {
      if (left === right) out.push(at);
      return;
    }
    for (const p of [0, 1, 2]) walk(i + 1, [...at, p], left + (p === 1 ? weights[i] : 0), right + (p === 2 ? weights[i] : 0));
  };
  walk(0, [], load, 0);
  return out;
}
function weightsGame(random: Random): Omit<State, "key"> {
  for (;;) {
    const n = between(random, 4, 5),
      pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20],
      weights: number[] = [];
    while (weights.length < n) {
      const w = pick(random, pool);
      if (!weights.includes(w)) weights.push(w);
    }
    weights.sort((a, b) => a - b);
    // A setting drawn at random, at least one weight beside the parcel, gives the parcel's weight; it is kept when no other setting levels it.
    const at = weights.map(() => between(random, 0, 2));
    if (!at.includes(1) || !at.includes(2)) continue;
    const load = weights.reduce((sum, w, i) => sum + (at[i] === 2 ? w : at[i] === 1 ? -w : 0), 0);
    if (load < 3 || load > 40 || levellings(load, weights).length !== 1) continue;
    return { ...blank(), kind: "weights", weights, load, spice: between(random, 0, SPICES.length - 1), pans: weights.map(() => 0), answer: at };
  }
}
const leftWeight = (s: State) => s.load + s.weights.reduce((sum, w, i) => sum + (s.pans[i] === 1 ? w : 0), 0);
const rightWeight = (s: State) => s.weights.reduce((sum, w, i) => sum + (s.pans[i] === 2 ? w : 0), 0);

/* ---------------------------------------------------------------- goods */

/** A pan's weight with the goods weighing as given. */
export const panWeight = (items: number[], values: number[]) => items.reduce((sum, x) => sum + (x >= WEIGHT ? x - WEIGHT : values[x]), 0);
/** How many settings of the dials (1 to `max`) level every scale, up to `cap`. */
function goodsAnswers(kinds: number, scales: Pans[], max: number, cap = 2) {
  let found = 0;
  const values = new Array(kinds).fill(1);
  const walk = (i: number): boolean => {
    if (i === kinds) {
      if (scales.every((sc) => panWeight(sc.left, values) === panWeight(sc.right, values))) found++;
      return found >= cap;
    }
    for (let v = 1; v <= max; v++) {
      values[i] = v;
      if (walk(i + 1)) return true;
    }
    return false;
  };
  walk(0);
  return found;
}
function goodsGame(random: Random): Omit<State, "key"> {
  const max = 12;
  for (;;) {
    const kinds = random() < 0.6 ? 3 : 4,
      answer: number[] = [];
    while (answer.length < kinds) {
      const v = between(random, 1, 9);
      if (!answer.includes(v)) answer.push(v);
    }
    const scales: Pans[] = [];
    // No more than five scales: three at the back of the table and two before them.
    for (let tries = 0; tries < 40 && scales.length < Math.min(5, kinds + 1); tries++) {
      const side = () => Array.from({ length: between(random, 1, 3) }, () => between(random, 0, kinds - 1)).sort(),
        left = side();
      let right: number[];
      if (random() < 0.4) right = [];
      else right = side().filter((x) => !left.includes(x));
      const diff = panWeight(left, answer) - panWeight(right, answer);
      if (diff > 0) right = [...right, WEIGHT + diff];
      else if (diff < 0) left.push(WEIGHT - diff);
      if (!right.length || Math.abs(diff) > 15) continue;
      const scale = { left, right };
      if (scales.some((x) => JSON.stringify(x) === JSON.stringify(scale))) continue;
      scales.push(scale);
      if (scales.length >= kinds - 1 && goodsAnswers(kinds, scales, max) === 1) {
        // At least one weight must stand on some pan, or only the goods' ratios would be told.
        if (!scales.some((x) => [...x.left, ...x.right].some((i) => i >= WEIGHT))) continue;
        return { ...blank(), kind: "goods", scales, answer, guess: new Array(kinds).fill(1), max };
      }
    }
  }
}

/* --------------------------------------------------------------- mobile */

/** A subtree's whole weight, its leaves weighing as given. */
export function hung(node: Node, weights: number[]): number {
  return isLeaf(node) ? weights[node.leaf] : hung(node.left, weights) + hung(node.right, weights);
}
/** Every rod of a mobile, the top first. */
export function rods(root: Rod): Rod[] {
  const out: Rod[] = [];
  const walk = (node: Node) => {
    if (isLeaf(node)) return;
    out.push(node);
    walk(node.left);
    walk(node.right);
  };
  walk(root);
  return out;
}
/** How a rod leans: positive when its left end is the heavier. */
export const lean = (rod: Rod, weights: number[]) => hung(rod.left, weights) * rod.a - hung(rod.right, weights) * rod.b;
/** The leaves' weights with the dials as they are. */
export const shownLeaves = (s: Pick<State, "leaves" | "hidden" | "guess">) => s.leaves.map((w, i) => (s.hidden.includes(i) ? s.guess[s.hidden.indexOf(i)] : w));
/** How far a subtree reaches to its left and right of the thread it hangs from, in arm steps (a leaf is half a step either way). */
export function reach(node: Node): [number, number] {
  if (isLeaf(node)) return [0.55, 0.55];
  return [node.a + reach(node.left)[0], node.b + reach(node.right)[1]];
}
function mobileGame(random: Random): Omit<State, "key"> {
  for (;;) {
    let leaves = 0;
    const leaf = (): Leaf => ({ leaf: leaves++ }),
      rod = (left: Node, right: Node): Rod => {
        // Arms long enough that the two sides hang clear of each other.
        const [, lr] = reach(left),
          [rl] = reach(right);
        let a = between(random, 1, 3),
          b = between(random, 1, 3);
        while (a - lr + b - rl < 0.5) random() < 0.5 ? a++ : b++;
        return { a, b, left, right };
      },
      shape = between(random, 0, 2),
      root = shape === 0 ? rod(leaf(), rod(leaf(), leaf())) : shape === 1 ? rod(rod(leaf(), leaf()), leaf()) : rod(rod(leaf(), leaf()), rod(leaf(), leaf()));
    // The smallest whole weights that balance every rod, found from the bottom up.
    const weights = new Array(leaves).fill(1);
    const scaleLeaves = (node: Node, k: number) => {
      if (isLeaf(node)) weights[node.leaf] *= k;
      else {
        scaleLeaves(node.left, k);
        scaleLeaves(node.right, k);
      }
    };
    const settle = (node: Node) => {
      if (isLeaf(node)) return;
      settle(node.left);
      settle(node.right);
      const wl = hung(node.left, weights) * node.a,
        wr = hung(node.right, weights) * node.b,
        g = gcd(wl, wr);
      scaleLeaves(node.left, wr / g);
      scaleLeaves(node.right, wl / g);
    };
    settle(root);
    // It must hang clear of the stall's posts.
    if (Math.max(...reach(root)) > 6.4) continue;
    const k = Math.max(...weights) <= 12 && random() < 0.5 ? 2 : 1;
    weights.forEach((_, i) => (weights[i] *= k));
    if (Math.max(...weights) > 36) continue;
    // Some leaves are hidden behind dials: only small ones, never all, and they must come out one way only.
    const small = weights.flatMap((w, i) => (w <= 12 ? [i] : [])),
      count = Math.min(small.length, between(random, 1, Math.min(3, rods(root).length)), leaves - 1);
    if (count < 1) continue;
    const hidden: number[] = [];
    while (hidden.length < count) {
      const i = pick(random, small);
      if (!hidden.includes(i)) hidden.push(i);
    }
    hidden.sort((x, y) => x - y);
    const max = 15;
    // The dials start at 1: a mobile already level with them all at 1 is laid again.
    if (hidden.every((i) => weights[i] === 1) || mobileAnswers(root, weights, hidden, max) !== 1) continue;
    return { ...blank(), kind: "mobile", mobile: root, leaves: weights, hidden, answer: hidden.map((i) => weights[i]), guess: hidden.map(() => 1), max };
  }
}
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}
/** How many settings of the hidden leaves (1 to `max`) balance every rod, up to 2. */
function mobileAnswers(root: Rod, weights: number[], hidden: number[], max: number) {
  let found = 0;
  const w = [...weights],
    all = rods(root);
  const walk = (i: number): boolean => {
    if (i === hidden.length) {
      if (all.every((r) => lean(r, w) === 0)) found++;
      return found >= 2;
    }
    for (let v = 1; v <= max; v++) {
      w[hidden[i]] = v;
      if (walk(i + 1)) return true;
    }
    return false;
  };
  walk(0);
  return found;
}

/* ---------------------------------------------------------------- play */

/** A puzzle of a stage (1 coins, 2 weights, 3 goods, 4 mobile), laid at random. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const kind = KINDS[Math.max(0, Math.min(3, Math.round(stage) - 1))] ?? "coins",
    made = kind === "coins" ? coinsGame(random) : kind === "weights" ? weightsGame(random) : kind === "goods" ? goodsGame(random) : mobileGame(random);
  return { ...made, key: Math.floor(random() * 1e9) };
}
/** How many scales or rods the dials leave leaning. */
function leaning(s: State) {
  if (s.kind === "goods") return s.scales.filter((sc) => panWeight(sc.left, s.guess) !== panWeight(sc.right, s.guess)).length;
  if (s.kind === "mobile" && s.mobile) {
    const w = shownLeaves(s);
    return rods(s.mobile).filter((r) => lean(r, w) !== 0).length;
  }
  return 0;
}
/** Whether the dials level everything. */
export function levelled(s: State) {
  if (s.kind === "goods") return s.scales.every((sc) => panWeight(sc.left, s.guess) === panWeight(sc.right, s.guess));
  if (s.kind === "mobile" && s.mobile) {
    const w = shownLeaves(s);
    return rods(s.mobile).every((r) => lean(r, w) === 0);
  }
  return false;
}
const dials = (s: State) => (s.kind === "goods" || s.kind === "mobile" ? s.guess.length : 0);
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  const out: number[] = [];
  if (s.kind === "coins") {
    for (let c = 0; c < s.coins; c++) out.push(c);
    if (weighable(s)) out.push(WEIGH);
    out.push(ACCUSE);
  } else if (s.kind === "weights") s.weights.forEach((_, i) => out.push(i));
  else {
    for (let i = 0; i < dials(s); i++) out.push(UP + i, DOWN + i);
    out.push(CHECK);
  }
  return out.map((to) => ({ from: -1, to, extra: -1 }));
}
export function play(s: State, move: Move): State | null {
  if (s.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const to = move.to;
  const next = { ...s, last: { to }, ply: s.ply + 1 },
    put = putOf(to),
    items = s.kind === "coins" ? s.coins : s.kind === "weights" ? s.weights.length : 0;
  // A coin or weight dragged somewhere: it lies there now (nothing is put where it already lies).
  if (put) {
    if (!Number.isInteger(to) || put.item >= items || s.pans[put.item] === put.pan || (s.kind === "coins" && s.accusing)) return null;
    const placed = { ...next, last: { to: put.item }, pans: s.pans.map((p, i) => (i === put.item ? put.pan : p)) };
    return s.kind === "weights" ? { ...placed, winner: leftWeight(placed) === rightWeight(placed) ? 0 : null } : placed;
  }
  if (s.kind === "coins") {
    if (to === ACCUSE) return { ...next, accusing: !s.accusing };
    if (to === WEIGH) {
      if (!weighable(s)) return null;
      const { left, right } = onPans(s),
        // Unequal numbers: the side with more coins goes down, whichever is false (it differs by less than a coin).
        tip = fair({ left, right }) ? fall(s, { left, right }) : left.length > right.length ? 1 : -1;
      return { ...next, log: [...s.log, { left, right, tip }] };
    }
    if (!Number.isInteger(to) || to < 0 || to >= s.coins) return null;
    if (!s.accusing) return { ...next, pans: s.pans.map((p, i) => (i === to ? (p + 1) % 3 : p)) };
    // Naming a coin: right only when the weighings leave no other.
    const sure = suspects(s);
    if (sure.length === 1 && sure[0] === to) return { ...next, accusing: false, fake: to, winner: 0 };
    const fake = sure.find((c) => c !== to) ?? to;
    return {
      ...next,
      accusing: false,
      fake,
      winner: 1,
      trouble: sure.includes(to) ? `가짜는 ${fake + 1}번이었습니다. 저울 결과로는 아직 ${sure.length}개 중 하나로만 좁혀져 있었습니다.` : `${to + 1}번은 저울로 이미 진짜임이 드러난 동전입니다. 가짜는 ${fake + 1}번이었습니다.`,
    };
  }
  if (s.kind === "weights") {
    if (!Number.isInteger(to) || to < 0 || to >= s.weights.length) return null;
    const placed = { ...next, pans: s.pans.map((p, i) => (i === to ? (p + 1) % 3 : p)) };
    return { ...placed, winner: leftWeight(placed) === rightWeight(placed) ? 0 : null };
  }
  // The answer handed in: right only when every scale or rod is level with the dials as they stand.
  if (to === CHECK) {
    if (levelled(s)) return { ...next, winner: 0 };
    const off = leaning(s);
    return { ...next, winner: 1, trouble: s.kind === "goods" ? `고른 무게로는 저울 ${off}개가 기웁니다.` : `고른 무게로는 막대 ${off}개가 기웁니다.` };
  }
  let guess: number[];
  const n = dials(s);
  if (to >= SET) {
    const i = Math.floor((to - SET) / 64),
      v = (to - SET) % 64;
    if (i >= n || v < 1 || v > s.max) return null;
    guess = s.guess.map((g, k) => (k === i ? v : g));
  } else if (to >= DOWN && to < DOWN + n) guess = s.guess.map((g, k) => (k === to - DOWN ? (g <= 1 ? s.max : g - 1) : g));
  else if (to >= UP && to < UP + n) guess = s.guess.map((g, k) => (k === to - UP ? (g >= s.max ? 1 : g + 1) : g));
  else return null;
  // Turning a dial tells nothing: the scales stay as they are until the answer is handed in.
  return { ...next, guess };
}
/** The next thing to press on the way to the answer. */
export function hint(s: State): Move | null {
  if (s.winner !== null) return null;
  if (s.kind === "coins") return coinHint(s);
  if (s.kind === "weights") {
    const i = s.answer.findIndex((p, k) => p !== s.pans[k]);
    return i < 0 ? null : { from: -1, to: putOn(i, s.answer[i]), extra: -1 };
  }
  const i = s.answer.findIndex((v, k) => v !== s.guess[k]);
  return { from: -1, to: i < 0 ? CHECK : setTo(i, s.answer[i]), extra: -1 };
}
const tellHeavy = (s: State) => (s.heavy === 1 ? "가짜는 더 무겁습니다" : s.heavy === -1 ? "가짜는 더 가볍습니다" : "가짜가 무거운지 가벼운지는 모릅니다");
export function ruleText(s: State) {
  if (s.kind === "coins")
    return s.accusing ? "가짜라고 확신하는 동전을 누르세요." : `동전 ${s.coins}개 중 가짜 하나 · 저울 ${s.allowed - s.log.length}번 남음 · ${tellHeavy(s)}`;
  if (s.kind === "weights") return `${SPICES[s.spice][0]} ${s.load}g을 추로 달아 저울을 수평으로 맞추세요.`;
  if (s.kind === "goods") return "저울이 모두 수평이 되는 물건의 무게를 찾아 정하고 정답 확인을 누르세요.";
  return "모빌이 균형을 이루는 ? 추의 무게를 찾아 정하고 정답 확인을 누르세요.";
}
const effect = (): Effect | null => null;
export const balance: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (s, move) => play(s, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: (s) => ruleText(s),
  tally: () => ["", ""],
  reason: (s) =>
    s.winner === 1
      ? `실패! ${s.trouble}`
      : s.kind === "coins"
        ? `성공! ${(s.fake ?? 0) + 1}번 동전이 가짜입니다.`
        : s.kind === "weights"
          ? "성공! 저울이 수평을 이뤘습니다."
          : s.kind === "goods"
            ? `성공! 모든 저울이 수평입니다. ${s.answer.map((v, i) => `${GOODS[i]} ${v}`).join(", ")}.`
            : "성공! 모빌이 균형을 이뤘습니다.",
};
