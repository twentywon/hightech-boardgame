/**
 * Exact battle probabilities, computed once and kept. A roll of `a` attacking dice against `d` defending dice is
 * every one of its 6^(a+d) outcomes counted; a whole battle is the chance, by dynamic programming over the armies
 * left, that an attacker with `attackers` armies on its territory (one always stays behind) takes a territory held
 * by `defenders`. Free of Three.js and DOM.
 */
/** For a roll of `a` against `d` dice: the chance of each outcome, as [attacker's losses, defender's losses, chance]. */
const rolls = new Map<string, [number, number, number][]>();
export function rollOdds(a: number, d: number): [number, number, number][] {
  const key = `${a}:${d}`,
    known = rolls.get(key);
  if (known) return known;
  const counts = new Map<string, number>(),
    total = 6 ** (a + d);
  for (let n = 0; n < total; n++) {
    const dice: number[] = [];
    let k = n;
    for (let i = 0; i < a + d; i++) {
      dice.push((k % 6) + 1);
      k = Math.floor(k / 6);
    }
    const [lostA, lostD] = compare(dice.slice(0, a), dice.slice(a));
    const at = `${lostA}:${lostD}`;
    counts.set(at, (counts.get(at) ?? 0) + 1);
  }
  const out = [...counts].map(([at, n]) => {
    const [x, y] = at.split(":").map(Number);
    return [x, y, n / total] as [number, number, number];
  });
  out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  rolls.set(key, out);
  return out;
}
/** The highest dice meet in pairs; a tie goes to the defender. Returns what each side loses. */
export function compare(attack: number[], defend: number[]): [number, number] {
  const a = [...attack].sort((x, y) => y - x),
    d = [...defend].sort((x, y) => y - x);
  let lostA = 0,
    lostD = 0;
  for (let i = 0; i < Math.min(a.length, d.length); i++) {
    if (a[i] > d[i]) lostD++;
    else lostA++;
  }
  return [lostA, lostD];
}
/** Dice each side rolls: the attacker up to three, never more than its armies less one; the defender up to two. */
export const attackDice = (armies: number) => Math.max(0, Math.min(3, armies - 1));
export const defendDice = (armies: number) => Math.max(0, Math.min(2, armies));
/** Battles are worked out up to this many armies a side; larger ones are scaled down to it. */
const LIMIT = 80;
let table: Float64Array | null = null;
function battles() {
  if (table) return table;
  const t = new Float64Array((LIMIT + 1) * (LIMIT + 1)),
    at = (a: number, d: number) => a * (LIMIT + 1) + d;
  for (let a = 1; a <= LIMIT; a++)
    for (let d = 0; d <= LIMIT; d++) {
      if (d === 0) t[at(a, d)] = 1;
      else if (a === 1) t[at(a, d)] = 0;
      else {
        let p = 0;
        for (const [lostA, lostD, chance] of rollOdds(attackDice(a), defendDice(d))) p += chance * t[at(a - lostA, d - lostD)];
        t[at(a, d)] = p;
      }
    }
  table = t;
  return t;
}
/** The chance that `attackers` armies on a territory (one stays behind) take one held by `defenders`, attacking to the end. */
export function winChance(attackers: number, defenders: number) {
  if (defenders <= 0) return 1;
  if (attackers <= 1) return 0;
  const big = Math.max(attackers, defenders),
    scale = big > LIMIT ? LIMIT / big : 1,
    a = Math.max(1, Math.round(attackers * scale)),
    d = Math.max(1, Math.round(defenders * scale));
  return battles()[a * (LIMIT + 1) + d];
}
