import type { Random } from "../../core/random";
import type { Move } from "../points/types";
import type { Level } from "../points/ai";
import { chances, loose, sight, type Odds, type Sight } from "./deduce";
import { GAP, JOKER, POOL, READY, SAY, STOP, tileCode, type State } from "./rules";

/** A guess the computer weighs: a hidden tile of another seat, a number for it, and how likely that is. */
interface Guess {
  seat: number;
  index: number;
  n: number;
  p: number;
}
const move = (to: number, extra = -1): Move => ({ from: -1, to, extra });
const pick = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
/** How many tiles of a seat are hidden, as the seat looking sees it. */
const hiddenOf = (view: Sight, seat: number) => view.rows[seat].filter((t) => t.known === null).length;
/**
 * The computer's move. It reads only what its own seat sees (`sight`): its tiles, every tile face up, the colours
 * and places of the hidden ones and the numbers said wrongly of them; never a hidden tile.
 */
export function chooseMove(s: State, level: Level, random: Random): Move | null {
  if (s.winner !== null) return null;
  const view = sight(s, s.seat);
  switch (s.phase) {
    case "joker":
      // Anywhere in its row: a joker tells nothing by where it stands.
      return move(GAP + Math.floor(random() * (s.rows[s.seat].length + 1)));
    case "arrange":
      return move(READY);
    case "draw": {
      // Any tile of the pool: they are alike from the back but for the colour.
      const slots = s.pool.flatMap((id, i) => (id === null ? [] : [i]));
      return slots.length ? move(POOL + pick(slots, random)) : null;
    }
    case "reveal":
      return move(tileCode(s.seat, revealChoice(s, view, level, random)));
    case "guess":
    case "again": {
      const best = bestGuess(view, level, random, s.jokers);
      if (!best) return s.phase === "again" ? move(STOP) : null;
      if (s.phase === "again" && !goOn(s, view, level, best)) return move(STOP);
      return move(tileCode(best.seat, best.index), SAY + best.n);
    }
  }
}
/** The guess the computer would make: the likeliest number of the likeliest tile, by its level's reckoning. */
export function bestGuess(view: Sight, level: Level, random: Random, jokers = view.jokers): Guess | null {
  if (level === "easy") {
    // Easy: a loose reading; the tile with fewest numbers left, a number of those at random.
    const tiles = loose(view).filter((t) => t.odds.some((p) => p > 0));
    if (!tiles.length) return null;
    const fewest = Math.min(...tiles.map((t) => t.odds.filter((p) => p > 0).length)),
      tile = pick(
        tiles.filter((t) => t.odds.filter((p) => p > 0).length === fewest),
        random,
      ),
      n = pick(
        tile.odds.flatMap((p, k) => (p > 0 && (jokers || k !== JOKER) ? [k] : [])),
        random,
      );
    return n === undefined ? null : { seat: tile.seat, index: tile.index, n, p: tile.odds[n] };
  }
  let { tiles, total } = chances(view);
  // An impossible reading (it should not happen) falls back on the loose one.
  if (!total) tiles = loose(view);
  const all: Guess[] = tiles.flatMap((t: Odds) => t.odds.flatMap((p, n) => (p > 0 ? [{ seat: t.seat, index: t.index, n, p }] : [])));
  if (!all.length) return null;
  const top = Math.max(...all.map((g) => g.p)),
    ties = all.filter((g) => g.p >= top - 1e-9);
  if (level === "normal") return pick(ties, random);
  // Hard: of equal chances, the tile whose row has fewest hidden (a right guess brings that player nearer the end).
  const fewest = Math.min(...ties.map((g) => hiddenOf(view, g.seat)));
  return pick(
    ties.filter((g) => hiddenOf(view, g.seat) === fewest),
    random,
  );
}
/** After a right guess: whether the chance of the next is worth what a wrong one would cost. */
function goOn(s: State, view: Sight, level: Level, best: Guess) {
  if (best.p > 0.999) return level !== "easy" || s.streak < 3;
  if (level === "easy") return false;
  if (level === "normal") return best.p >= 0.6 && s.streak < 3;
  // Hard weighs the risk: a wrong guess shows the drawn tile (or, with the pool empty, one of its own row), which
  // costs more the fewer it still has hidden; a right one that ends a player is worth more.
  const mine = hiddenOf(view, s.seat) + (s.held !== null ? 1 : 0);
  let need = 0.5;
  if (s.held === null) need += 0.12;
  if (mine <= 1) need += 0.25;
  else if (mine <= 3) need += 0.1;
  if (hiddenOf(view, best.seat) === 1) need -= 0.12;
  return best.p >= need;
}
/**
 * Which of its own hidden tiles the computer lays face up when it must: easy any, the others the one the rest of the
 * table could already tell most surely (it gives away least).
 */
function revealChoice(s: State, view: Sight, level: Level, random: Random) {
  const mine = view.rows[s.seat].flatMap((t, i) => (t.up ? [] : [i]));
  if (level === "easy" || mine.length === 1) return pick(mine, random);
  // What everyone can see of this row, with its own numbers taken away.
  const open: Sight = { ...view, seat: -1, holding: [], rows: view.rows.map((row, k) => (k === s.seat ? row.map((t, i) => (mine.includes(i) ? { ...t, known: null } : t)) : row)) };
  const { tiles, total } = chances(open);
  if (!total) return pick(mine, random);
  let best = mine[0],
    sure = -1;
  for (const i of mine) {
    const odds = tiles.find((t) => t.seat === s.seat && t.index === i);
    const p = odds ? Math.max(...odds.odds) : 0;
    if (p > sure + 1e-9) {
      sure = p;
      best = i;
    }
  }
  return best;
}
