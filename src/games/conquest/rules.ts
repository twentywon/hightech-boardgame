import type { Random } from "../../core/random";
import { generateMap, type Size, type WorldMap } from "./map";
import { attackDice, compare, defendDice } from "./odds";

/**
 * 대륙 쟁탈전: a world-conquest game for two to six on a world made anew for every game. A turn is reinforcing
 * (armies for the territories and continents held, and for a set of cards traded), attacking as often as one likes
 * with dice, and one move of armies along one's own territories. Every change is one call of `play`, which never
 * changes the state it is given and answers null to what the rules do not allow. Free of Three.js and DOM.
 */
export type Mode = "conquest" | "capitals" | "turns";
export const MODES: Record<Mode, string> = { conquest: "정복", capitals: "수도 점령", turns: "턴 제한" };
/** 보병, 기병, 포병, and the wild card that stands for any of them. */
export type CardKind = 0 | 1 | 2 | 3;
export const CARD_NAMES = ["보병", "기병", "포병", "와일드"] as const;
export const WILD: CardKind = 3;
export interface Card {
  id: number;
  kind: CardKind;
}
export interface Seat {
  alive: boolean;
  cards: Card[];
  /** The territory that is this player's capital (수도 점령), or -1. */
  capital: number;
}
export type Phase = "reinforce" | "attack" | "occupy" | "fortify" | "over";
export interface Roll {
  attack: number[];
  defend: number[];
  lostA: number;
  lostD: number;
}
/** What the last change did, for the table to show it and the status line to tell it. */
export type Last =
  | { kind: "place"; player: number; territory: number; count: number }
  | { kind: "trade"; player: number; value: number; cards: Card[] }
  | { kind: "battle"; player: number; defender: number; from: number; to: number; rolls: Roll[]; conquered: boolean; moved: number; eliminated: boolean; taken: number }
  | { kind: "occupy" | "fortify"; player: number; from: number; to: number; count: number }
  | { kind: "phase"; player: number }
  | { kind: "turn"; player: number; previous: number; drew: boolean }
  | null;
export interface Options {
  players: number;
  size: Size;
  mode: Mode;
  /** Rounds of a 턴 제한 game. */
  rounds?: number;
  /** Seats 0 to `people` − 1 are people at this screen: the game is over once none of them is left. */
  people?: number;
}
export interface State {
  map: WorldMap;
  mode: Mode;
  rounds: number;
  people: number;
  owner: number[];
  armies: number[];
  seats: Seat[];
  turn: number;
  /** Rounds begun, from 1; a round ends when the turn comes back round. */
  round: number;
  phase: Phase;
  /** Armies still to place. */
  reserve: number;
  /** Reinforcing in the middle of an attack (cards taken from a player knocked out): placing them all goes back to attacking. */
  resume: boolean;
  /** Whether a territory has been taken this turn (a card is drawn at its end). */
  conquered: boolean;
  /** Attacks made this turn (a roll or a battle to the end each). */
  fights: number;
  /** After a conquest: armies that may follow the ones that went in. */
  pending: { from: number; to: number; max: number } | null;
  deck: Card[];
  discard: Card[];
  /** Sets traded so far by anyone: the next is worth more. */
  trades: number;
  last: Last;
  ply: number;
  winners: number[];
  /** Why the game ended. */
  end: "" | "conquest" | "capitals" | "turns" | "people" | "alone";
}
export type Action =
  | { type: "trade"; cards: number[] }
  | { type: "place"; territory: number; count: number }
  | { type: "attack"; from: number; to: number; blitz?: boolean }
  | { type: "occupy"; count: number }
  | { type: "fortify"; from: number; to: number; count: number }
  | { type: "next" };
/** Rounds a 턴 제한 game may last. */
export const ROUND_CHOICES = [8, 12, 16];
/** What the n-th set traded (from 0) is worth: 4, 6, 8, 10, 12, 15, then five more each. */
export const setValue = (n: number) => (n < 5 ? 4 + 2 * n : 15 + 5 * (n - 5));
/** Hands of this many cards must trade a set before placing. */
export const MUST_TRADE = 5;
/** Armies each player starts with, for this many players on this many territories. */
export function startingArmies(players: number, territories: number) {
  return Math.max(Math.ceil(territories / players) + 3, Math.round((territories * 2.4) / players));
}
const die = (random: Random) => Math.min(6, Math.floor(random() * 6) + 1);
function shuffle<T>(list: T[], random: Random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
/** A new game: a new world, its territories dealt out at random and the starting armies set on them. */
export function createGame(options: Options, random: Random, map: WorldMap = generateMap(options.size, random)): State {
  const players = Math.max(2, Math.min(6, options.players)),
    count = map.territories.length,
    owner = new Array<number>(count).fill(-1),
    armies = new Array<number>(count).fill(1),
    order = shuffle(map.territories.map((t) => t.id), random);
  // Dealt from the last seat, so that the first to move is not also the one with a territory more.
  order.forEach((t, k) => (owner[t] = players - 1 - (k % players)));
  const start = startingArmies(players, count);
  for (let p = 0; p < players; p++) {
    const mine = owner.flatMap((o, t) => (o === p ? [t] : []));
    // The rest are spread at random, more often on territories that face an enemy.
    const weights = mine.map((t) => (map.territories[t].neighbours.some((n) => owner[n] !== p) ? 3 : 1)),
      sum = weights.reduce((s, w) => s + w, 0);
    for (let left = start - mine.length; left > 0; left--) {
      let r = random() * sum,
        k = 0;
      while (k < mine.length - 1 && (r -= weights[k]) > 0) k++;
      armies[mine[k]]++;
    }
  }
  const seats: Seat[] = Array.from({ length: players }, () => ({ alive: true, cards: [], capital: -1 }));
  if (options.mode === "capitals")
    seats.forEach((seat, p) => {
      // A capital is where the player is most at home: the territory with the most of its own around it.
      const mine = owner.flatMap((o, t) => (o === p ? [t] : [])),
        home = (t: number) => map.territories[t].neighbours.filter((n) => owner[n] === p).length;
      const best = Math.max(...mine.map(home)),
        choices = mine.filter((t) => home(t) === best);
      seat.capital = choices[Math.floor(random() * choices.length) % choices.length];
      armies[seat.capital] += 2;
    });
  // One card for every territory, the three kinds in turn, and two wild cards.
  const deck = shuffle<Card>(
    [...map.territories.map((_, i): Card => ({ id: i, kind: (i % 3) as CardKind })), { id: count, kind: WILD }, { id: count + 1, kind: WILD }],
    random,
  );
  const state: State = {
    map,
    mode: options.mode,
    rounds: options.mode === "turns" ? Math.max(1, options.rounds ?? ROUND_CHOICES[0]) : 0,
    people: Math.max(0, Math.min(players, options.people ?? 0)),
    owner,
    armies,
    seats,
    turn: 0,
    round: 1,
    phase: "reinforce",
    reserve: 0,
    resume: false,
    conquered: false,
    fights: 0,
    pending: null,
    deck,
    discard: [],
    trades: 0,
    last: null,
    ply: 0,
    winners: [],
    end: "",
  };
  state.reserve = income(state, 0);
  return state;
}
const copy = (s: State): State => ({ ...s, owner: [...s.owner], armies: [...s.armies], seats: s.seats.map((seat) => ({ ...seat, cards: [...seat.cards] })), deck: [...s.deck], discard: [...s.discard] });
export const territoriesOf = (s: State, player: number) => s.owner.reduce((n, o) => n + (o === player ? 1 : 0), 0);
export const armiesOf = (s: State, player: number) => s.owner.reduce((n, o, t) => n + (o === player ? s.armies[t] : 0), 0);
/** Continents `player` holds whole. */
export const continentsOf = (s: State, player: number) => s.map.continents.filter((c) => c.territories.every((t) => s.owner[t] === player));
/** Armies a turn brings: a third of the territories held (at least three), and the bonus of every continent held whole. */
export function income(s: State, player: number) {
  return Math.max(3, Math.floor(territoriesOf(s, player) / 3)) + continentsOf(s, player).reduce((n, c) => n + c.bonus, 0);
}
/** Whether three cards make a set: three of a kind, one of each, or any two with a wild card. */
export function isSet(cards: Card[]) {
  if (cards.length !== 3) return false;
  if (cards.some((c) => c.kind === WILD)) return true;
  const kinds = new Set(cards.map((c) => c.kind));
  return kinds.size === 1 || kinds.size === 3;
}
/** Every set in a hand, by card ids, the ones that keep wild cards first. */
export function setsIn(cards: Card[]) {
  const out: number[][] = [];
  for (let a = 0; a < cards.length; a++)
    for (let b = a + 1; b < cards.length; b++)
      for (let c = b + 1; c < cards.length; c++) if (isSet([cards[a], cards[b], cards[c]])) out.push([cards[a].id, cards[b].id, cards[c].id]);
  const wilds = (ids: number[]) => ids.filter((id) => cards.find((c) => c.id === id)!.kind === WILD).length;
  return out.sort((x, y) => wilds(x) - wilds(y));
}
/** Whether the player to move must trade a set before placing. */
export const mustTrade = (s: State) => s.phase === "reinforce" && s.seats[s.turn].cards.length >= MUST_TRADE && setsIn(s.seats[s.turn].cards).length > 0;
/** Territories `from` can attack: neighbours held by another player. */
export function targets(s: State, from: number) {
  if (s.owner[from] !== s.turn || s.armies[from] < 2) return [];
  return s.map.territories[from].neighbours.filter((n) => s.owner[n] !== s.turn);
}
/** Territories of the mover's that armies from `from` can reach, along territories of its own. */
export function reachable(s: State, from: number) {
  const me = s.owner[from],
    seen = new Set([from]),
    queue = [from];
  for (let q = 0; q < queue.length; q++)
    for (const n of s.map.territories[queue[q]].neighbours)
      if (!seen.has(n) && s.owner[n] === me) {
        seen.add(n);
        queue.push(n);
      }
  seen.delete(from);
  return [...seen].sort((a, b) => a - b);
}
/** The players still in, in seat order. */
export const alive = (s: State) => s.seats.flatMap((seat, p) => (seat.alive ? [p] : []));
/** Ends the game if someone has won: the last player in, the whole world taken, every capital held, or no person left. */
function settle(s: State) {
  const left = alive(s);
  if (left.length === 1) return over(s, left, s.owner.every((o) => o === left[0]) ? "conquest" : "alone");
  const first = s.owner[0];
  if (s.owner.every((o) => o === first)) return over(s, [first], "conquest");
  if (s.mode === "capitals") {
    const capitals = s.seats.map((seat) => seat.capital).filter((t) => t >= 0),
      holder = s.owner[capitals[0]];
    if (capitals.every((t) => s.owner[t] === holder)) return over(s, [holder], "capitals");
  }
  if (s.people > 0 && !left.some((p) => p < s.people)) return over(s, leaders(s, left), "people");
  return s;
}
/** The players ahead: most territories, then most armies. */
function leaders(s: State, among: number[]) {
  const score = (p: number) => territoriesOf(s, p) * 10000 + armiesOf(s, p),
    best = Math.max(...among.map(score));
  return among.filter((p) => score(p) === best);
}
function over(s: State, winners: number[], end: State["end"]) {
  s.phase = "over";
  s.winners = winners;
  s.end = end;
  s.pending = null;
  return s;
}
/** The turn passes: a card for a turn that took a territory, then the next player in reinforces. */
function endTurn(s: State, random: Random) {
  const previous = s.turn;
  let drew = false;
  if (s.conquered) {
    if (!s.deck.length && s.discard.length) {
      s.deck = shuffle(s.discard, random);
      s.discard = [];
    }
    const card = s.deck.pop();
    if (card) {
      s.seats[previous].cards.push(card);
      drew = true;
    }
  }
  let next = previous;
  do next = (next + 1) % s.seats.length;
  while (!s.seats[next].alive);
  if (next <= previous) s.round++;
  s.turn = next;
  s.phase = "reinforce";
  s.conquered = false;
  s.fights = 0;
  s.resume = false;
  s.pending = null;
  s.last = { kind: "turn", player: next, previous, drew };
  if (s.mode === "turns" && s.round > s.rounds) {
    s.round = s.rounds;
    return over(s, leaders(s, alive(s)), "turns");
  }
  s.reserve = income(s, next);
  return s;
}
/** After a conquest is settled: a hand grown to five or more by a player's cards taken is traded and placed first. */
function afterConquest(s: State) {
  s.pending = null;
  if (s.phase === "over") return s;
  if (s.seats[s.turn].cards.length >= MUST_TRADE && setsIn(s.seats[s.turn].cards).length) {
    s.phase = "reinforce";
    s.resume = true;
    s.reserve = 0;
  } else s.phase = "attack";
  return s;
}
/** The state after `action` by the player to move, or null when it is not allowed. Dice and cards draw from `random`. */
export function play(state: State, action: Action, random: Random): State | null {
  if (state.phase === "over") return null;
  const me = state.turn,
    map = state.map,
    valid = (t: number) => Number.isInteger(t) && t >= 0 && t < map.territories.length;
  switch (action.type) {
    case "trade": {
      if (state.phase !== "reinforce" || new Set(action.cards).size !== 3) return null;
      const hand = state.seats[me].cards,
        cards = action.cards.map((id) => hand.find((c) => c.id === id));
      if (cards.some((c) => !c) || !isSet(cards as Card[])) return null;
      const s = copy(state),
        value = setValue(s.trades);
      s.seats[me].cards = hand.filter((c) => !action.cards.includes(c.id));
      s.discard.push(...(cards as Card[]));
      s.trades++;
      s.reserve += value;
      s.last = { kind: "trade", player: me, value, cards: cards as Card[] };
      s.ply++;
      return s;
    }
    case "place": {
      const count = action.count;
      if (state.phase !== "reinforce" || mustTrade(state) || !valid(action.territory) || state.owner[action.territory] !== me) return null;
      if (!Number.isInteger(count) || count < 1 || count > state.reserve) return null;
      const s = copy(state);
      s.armies[action.territory] += count;
      s.reserve -= count;
      s.last = { kind: "place", player: me, territory: action.territory, count };
      s.ply++;
      if (s.reserve === 0) {
        s.phase = "attack";
        s.resume = false;
      }
      return s;
    }
    case "attack": {
      const { from, to } = action;
      if (state.phase !== "attack" || !valid(from) || !valid(to) || !targets(state, from).includes(to)) return null;
      const s = copy(state),
        defender = s.owner[to],
        rolls: Roll[] = [];
      let a = s.armies[from],
        d = s.armies[to],
        dice = 0;
      do {
        dice = attackDice(a);
        const attack = Array.from({ length: dice }, () => die(random)).sort((x, y) => y - x),
          defend = Array.from({ length: defendDice(d) }, () => die(random)).sort((x, y) => y - x),
          [lostA, lostD] = compare(attack, defend);
        a -= lostA;
        d -= lostD;
        rolls.push({ attack, defend, lostA, lostD });
      } while (action.blitz && d > 0 && a > 1);
      s.armies[from] = a;
      s.armies[to] = d;
      s.fights++;
      s.ply++;
      if (d > 0) {
        s.last = { kind: "battle", player: me, defender, from, to, rolls, conquered: false, moved: 0, eliminated: false, taken: 0 };
        return s;
      }
      // Taken: the armies that rolled go in, and more may follow.
      s.owner[to] = me;
      s.armies[to] = dice;
      s.armies[from] = a - dice;
      s.conquered = true;
      const eliminated = !s.owner.includes(defender),
        taken = eliminated ? s.seats[defender].cards.length : 0;
      if (eliminated) {
        s.seats[defender].alive = false;
        s.seats[me].cards.push(...s.seats[defender].cards);
        s.seats[defender].cards = [];
      }
      s.last = { kind: "battle", player: me, defender, from, to, rolls, conquered: true, moved: dice, eliminated, taken };
      settle(s);
      if (s.phase === "over") return s;
      if (s.armies[from] > 1) {
        s.phase = "occupy";
        s.pending = { from, to, max: s.armies[from] - 1 };
        return s;
      }
      return afterConquest(s);
    }
    case "occupy": {
      const pending = state.pending;
      if (state.phase !== "occupy" || !pending || !Number.isInteger(action.count) || action.count < 0 || action.count > pending.max) return null;
      const s = copy(state);
      s.armies[pending.from] -= action.count;
      s.armies[pending.to] += action.count;
      s.last = { kind: "occupy", player: me, from: pending.from, to: pending.to, count: action.count };
      s.ply++;
      return afterConquest(s);
    }
    case "fortify": {
      const { from, to, count } = action;
      if (state.phase !== "fortify" || !valid(from) || !valid(to) || state.owner[from] !== me || !reachable(state, from).includes(to)) return null;
      if (!Number.isInteger(count) || count < 1 || count > state.armies[from] - 1) return null;
      const s = copy(state);
      s.armies[from] -= count;
      s.armies[to] += count;
      s.ply++;
      endTurn(s, random);
      // The move is what is shown, though the turn has passed with it.
      s.last = { kind: "fortify", player: me, from, to, count };
      return s;
    }
    case "next": {
      if (state.phase === "occupy" || (state.phase === "reinforce" && state.reserve > 0) || mustTrade(state)) return null;
      const s = copy(state);
      s.ply++;
      if (s.phase === "reinforce") {
        s.phase = "attack";
        s.resume = false;
        s.last = { kind: "phase", player: me };
      } else if (s.phase === "attack") {
        s.phase = "fortify";
        s.last = { kind: "phase", player: me };
      } else endTurn(s, random);
      return s;
    }
  }
  return null;
}
/** The card drawn at the end of the last turn, if one was: what `previous` holds last. */
export const drawnCard = (s: State) => (s.last?.kind === "turn" && s.last.drew ? s.seats[s.last.previous].cards.at(-1) ?? null : null);
