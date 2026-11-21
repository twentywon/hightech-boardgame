import type { Random } from "../../core/random";
import { generateMap, type Size, type WorldMap } from "./map";
import { attackDice, compare, defendDice } from "./odds";
import { worldMap } from "./world";

/**
 * 대륙 쟁탈전: a world-conquest game for two to six, played by the classic rules of the board game it resembles, on
 * the map of the real world (our own division of it) or on a world made anew. The game begins with the players
 * claiming the territories one army at a time and then reinforcing them one army at a time (or with everything dealt
 * at random); two players share the world with a neutral army. A turn is reinforcing (armies for the territories and
 * continents held, and for a set of cards traded), attacking as often as one likes with dice, and one move of armies.
 * Every change is one call of `play`, which never changes the state it is given and answers null to what the rules
 * do not allow. Free of Three.js and DOM.
 */
export type Mode = "conquest" | "missions" | "capitals" | "turns";
export const MODES: Record<Mode, string> = { conquest: "세계 정복", missions: "비밀 임무", capitals: "수도 점령", turns: "턴 제한" };
/** How the game begins: territories claimed in turn, or dealt and filled at random. */
export type Start = "claim" | "random";
export const STARTS: Record<Start, string> = { claim: "영토 고르기", random: "무작위 배치" };
/** How far the move at the end of a turn may go: to a neighbour (the classic rule), or along a path of one's own. */
export type MoveRule = "adjacent" | "connected";
export const MOVE_RULES: Record<MoveRule, string> = { adjacent: "고전 (이웃 한 칸)", connected: "연결된 길" };
/** 보병, 기병, 포병, and the wild card that stands for any of them. */
export type CardKind = 0 | 1 | 2 | 3;
export const CARD_NAMES = ["보병", "기병", "포병", "와일드"] as const;
export const WILD: CardKind = 3;
export interface Card {
  id: number;
  kind: CardKind;
  /** The territory named on the card, or -1 for a wild card. */
  territory: number;
}
/** A secret mission (비밀 임무): continents to hold, a number of territories (with at least `armies` each), or a player to knock out. */
export type Mission = { kind: "continents"; continents: number[]; extra: boolean } | { kind: "territories"; count: number; armies: number } | { kind: "destroy"; target: number };
export interface Seat {
  alive: boolean;
  cards: Card[];
  /** The territory that is this player's capital (수도 점령), or -1. */
  capital: number;
  /** The neutral army of a game for two: it holds territories and defends them, and never plays a turn. */
  neutral: boolean;
  /** 비밀 임무 only: what this player must do. Only its owner is ever shown it. */
  mission: Mission | null;
  /** Who knocked this player out, or -1. */
  by: number;
}
export type Phase = "claim" | "deploy" | "reinforce" | "attack" | "occupy" | "fortify" | "over";
export interface Roll {
  attack: number[];
  defend: number[];
  lostA: number;
  lostD: number;
}
/** What the last change did, for the table to show it and the status line to tell it. */
export type Last =
  | { kind: "place"; player: number; territory: number; count: number; claim?: boolean; neutral?: boolean }
  | { kind: "trade"; player: number; value: number; cards: Card[]; bonus: number }
  | { kind: "battle"; player: number; defender: number; from: number; to: number; rolls: Roll[]; conquered: boolean; moved: number; eliminated: boolean; taken: number }
  | { kind: "occupy" | "fortify"; player: number; from: number; to: number; count: number }
  | { kind: "phase"; player: number }
  | { kind: "turn"; player: number; previous: number; drew: boolean }
  | null;
export interface Options {
  players: number;
  size: Size;
  mode: Mode;
  /** The map of the real world instead of a generated one. */
  world?: boolean;
  /** How the game begins (claiming by default). */
  start?: Start;
  /** How far the last move of a turn may go (to a neighbour by default). */
  move?: MoveRule;
  /** Rounds of a 턴 제한 game. */
  rounds?: number;
  /** Seats 0 to `people` − 1 are people at this screen: the game is over once none of them is left. */
  people?: number;
}
export interface State {
  map: WorldMap;
  mode: Mode;
  start: Start;
  move: MoveRule;
  rounds: number;
  people: number;
  owner: number[];
  armies: number[];
  /** The players' seats, and after them the neutral army's in a game for two. */
  seats: Seat[];
  /** The neutral army's seat, or -1. */
  neutral: number;
  turn: number;
  /** Rounds begun, from 1; a round ends when the turn comes back round. */
  round: number;
  phase: Phase;
  /** Armies each seat has still to set down while the game is being set up. */
  pool: number[];
  /** Setting up a game for two: what the player to move still places this turn, on its own territories and on the neutral army's. */
  quota: { own: number; neutral: number } | null;
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
  end: "" | "conquest" | "mission" | "capitals" | "turns" | "people" | "alone";
}
export type Action =
  | { type: "trade"; cards: number[]; bonus?: number }
  | { type: "place"; territory: number; count: number }
  | { type: "attack"; from: number; to: number; blitz?: boolean; dice?: number }
  | { type: "occupy"; count: number }
  | { type: "fortify"; from: number; to: number; count: number }
  | { type: "next" };
/** Rounds a 턴 제한 game may last. */
export const ROUND_CHOICES = [8, 12, 16];
/** What the n-th set traded (from 0) is worth: 4, 6, 8, 10, 12, 15, then five more each. */
export const setValue = (n: number) => (n < 5 ? 4 + 2 * n : 15 + 5 * (n - 5));
/** Hands of this many cards must trade a set before placing. */
export const MUST_TRADE = 5;
/** A hand grown to this many by a player's cards taken is traded at once, down to MUST_TRADE − 1 or fewer. */
export const TAKEN_TRADE = 6;
/** Armies placed on a territory named on a traded card that the player holds. */
export const CARD_BONUS = 2;
/** The classic starting armies, for two to six players (a game for two gives as many to the neutral army). */
export const CLASSIC_ARMIES: Record<number, number> = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
/** The classic board's number of territories, by which the numbers are scaled to a generated world. */
const CLASSIC_TERRITORIES = 42;
/**
 * Armies each player starts with. The map of the real world takes the classic numbers; a generated world, which has
 * other numbers of territories, takes them in proportion (and always enough to hold its share and more).
 */
export function startingArmies(players: number, territories: number, scaled = true) {
  const p = Math.max(2, Math.min(6, players)),
    classic = CLASSIC_ARMIES[p];
  if (!scaled) return classic;
  return Math.max(Math.ceil(territories / (p === 2 ? 3 : p)) + 3, Math.round((classic * territories) / CLASSIC_TERRITORIES));
}
/** The territories a secret mission asks for: 24 and 18 on the real world, as many in proportion on a generated one. */
export function missionCounts(map: WorldMap) {
  const n = map.territories.length;
  if (map.size === "world") return { most: 24, guarded: 18 };
  return { most: Math.min(n - 1, Math.round((24 * n) / CLASSIC_TERRITORIES)), guarded: Math.min(n - 2, Math.round((18 * n) / CLASSIC_TERRITORIES)) };
}
const die = (random: Random) => Math.min(6, Math.floor(random() * 6) + 1);
function shuffle<T>(list: T[], random: Random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
/** The missions to hold continents on a map: the world's own, or on a generated world pairs of about a third of it. */
export function continentMissions(map: WorldMap): { continents: number[]; extra: boolean }[] {
  if (map.missions) return map.missions;
  const n = map.territories.length,
    sizes = map.continents.map((c) => c.territories.length),
    out: { continents: number[]; extra: boolean; off: number }[] = [];
  for (let a = 0; a < sizes.length; a++)
    for (let b = a + 1; b < sizes.length; b++) {
      const share = (sizes[a] + sizes[b]) / n;
      if (share >= 0.3 && share <= 0.55) out.push({ continents: [a, b], extra: false, off: Math.abs(share - 0.4) });
      else if (share >= 0.15 && share < 0.3 && sizes.length > 2) out.push({ continents: [a, b], extra: true, off: Math.abs(share - 0.24) });
    }
  return out
    .sort((x, y) => x.off - y.off || x.continents[0] - y.continents[0] || x.continents[1] - y.continents[1])
    .slice(0, 6)
    .map(({ continents, extra }) => ({ continents, extra }));
}
/** A new game: on the real world or a new one, set up as `options.start` says. */
export function createGame(options: Options, random: Random, map: WorldMap = options.world ? worldMap() : generateMap(options.size, random)): State {
  const players = Math.max(2, Math.min(6, options.players)),
    neutral = players === 2 ? 2 : -1,
    count = map.territories.length,
    start = options.start ?? "claim",
    armiesEach = startingArmies(players, count, map.size !== "world"),
    seats: Seat[] = Array.from({ length: players + (neutral >= 0 ? 1 : 0) }, (_, i) => ({ alive: true, cards: [], capital: -1, neutral: i === neutral, mission: null, by: -1 }));
  const state: State = {
    map,
    mode: options.mode,
    start,
    move: options.move ?? "adjacent",
    rounds: options.mode === "turns" ? Math.max(1, options.rounds ?? ROUND_CHOICES[0]) : 0,
    people: Math.max(0, Math.min(players, options.people ?? 0)),
    owner: new Array<number>(count).fill(-1),
    armies: new Array<number>(count).fill(0),
    seats,
    neutral,
    turn: 0,
    round: 1,
    phase: "claim",
    pool: seats.map(() => armiesEach),
    quota: null,
    reserve: 0,
    resume: false,
    conquered: false,
    fights: 0,
    pending: null,
    deck: [],
    discard: [],
    trades: 0,
    last: null,
    ply: 0,
    winners: [],
    end: "",
  };
  // One card for every territory, naming it, the three kinds in turn; and two wild cards.
  const cards = map.territories.map((_, i): Card => ({ id: i, kind: (i % 3) as CardKind, territory: i }));
  // The secret missions are dealt before anything is placed, so that the setting up can follow them.
  if (options.mode === "missions") {
    const { most, guarded } = missionCounts(map),
      deck: Mission[] = shuffle(
        [
          ...continentMissions(map).map((m): Mission => ({ kind: "continents", continents: [...m.continents], extra: m.extra })),
          { kind: "territories", count: most, armies: 1 },
          { kind: "territories", count: guarded, armies: 2 },
          ...Array.from({ length: players }, (_, target): Mission => ({ kind: "destroy", target })),
        ],
        random,
      );
    for (let p = 0; p < players; p++) {
      const mission = deck.pop()!;
      // A player told to knock out their own colour holds the larger number of territories instead.
      seats[p].mission = mission.kind === "destroy" && mission.target === p ? { kind: "territories", count: most, armies: 1 } : mission;
    }
  }
  if (neutral >= 0) {
    // Two players: the territory cards (the wild ones put aside) deal the world out in thirds, to each player and to
    // the neutral army, an army on each.
    shuffle([...cards], random).forEach((card, k) => {
      const seat = k % 3;
      state.owner[card.territory] = seat;
      state.armies[card.territory] = 1;
      state.pool[seat]--;
    });
  } else if (start === "random") {
    // Dealt from the last seat, so that the first to move is not also the one with a territory more.
    shuffle(map.territories.map((t) => t.id), random).forEach((t, k) => {
      const seat = players - 1 - (k % players);
      state.owner[t] = seat;
      state.armies[t] = 1;
      state.pool[seat]--;
    });
  }
  state.deck = shuffle([...cards, { id: count, kind: WILD, territory: -1 }, { id: count + 1, kind: WILD, territory: -1 }], random);
  if (start === "random") {
    // The rest are spread at random, more often on territories that face an enemy.
    seats.forEach((_, p) => spread(state, p, state.pool[p], random));
    return ready(state, random);
  }
  if (neutral >= 0) {
    state.phase = "deploy";
    state.quota = quotaFor(state, 0);
  }
  return state;
}
/** Sets `count` armies of seat `p` at random on its territories, three times as often on those facing another. */
function spread(s: State, p: number, count: number, random: Random) {
  const mine = s.owner.flatMap((o, t) => (o === p ? [t] : []));
  if (!mine.length || count <= 0) return;
  const weights = mine.map((t) => (s.map.territories[t].neighbours.some((n) => s.owner[n] !== p) ? 3 : 1)),
    sum = weights.reduce((a, w) => a + w, 0);
  for (let left = count; left > 0; left--) {
    let r = random() * sum,
      k = 0;
    while (k < mine.length - 1 && (r -= weights[k]) > 0) k++;
    s.armies[mine[k]]++;
  }
  s.pool[p] = 0;
}
/** What a player of a game for two places in a turn of setting up: two of its own and one of the neutral army's. */
function quotaFor(s: State, player: number) {
  return { own: Math.min(2, s.pool[player]), neutral: Math.min(1, s.pool[s.neutral]) };
}
/** The setting up is over: capitals are chosen, and the first player reinforces. */
function ready(s: State, random: Random) {
  if (s.neutral >= 0 && s.pool[s.neutral] > 0) spread(s, s.neutral, s.pool[s.neutral], random);
  if (s.mode === "capitals")
    s.seats.forEach((seat, p) => {
      if (seat.neutral) return;
      // A capital is where the player is most at home: the territory with the most of its own around it.
      const mine = s.owner.flatMap((o, t) => (o === p ? [t] : [])),
        home = (t: number) => s.map.territories[t].neighbours.filter((n) => s.owner[n] === p).length,
        best = Math.max(...mine.map(home)),
        choices = mine.filter((t) => home(t) === best);
      seat.capital = choices[Math.floor(random() * choices.length) % choices.length];
      s.armies[seat.capital] += 2;
    });
  s.pool = s.pool.map(() => 0);
  s.quota = null;
  s.turn = 0;
  s.round = 1;
  s.phase = "reinforce";
  s.reserve = income(s, 0);
  return s;
}
const copy = (s: State): State => ({
  ...s,
  owner: [...s.owner],
  armies: [...s.armies],
  pool: [...s.pool],
  quota: s.quota && { ...s.quota },
  seats: s.seats.map((seat) => ({ ...seat, cards: [...seat.cards] })),
  deck: [...s.deck],
  discard: [...s.discard],
});
/** Whether the game is still being set up (territories claimed, armies set down). */
export const settingUp = (s: State) => s.phase === "claim" || s.phase === "deploy";
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
/** The territories named on a set's cards that `player` holds: where the two armies of the card bonus may go. */
export function bonusTerritories(s: State, player: number, ids: number[]) {
  const hand = s.seats[player].cards;
  return ids.flatMap((id) => {
    const card = hand.find((c) => c.id === id);
    return card && card.territory >= 0 && s.owner[card.territory] === player ? [card.territory] : [];
  });
}
/** Whether the player to move must trade a set before placing. */
export const mustTrade = (s: State) => s.phase === "reinforce" && s.seats[s.turn].cards.length >= MUST_TRADE && setsIn(s.seats[s.turn].cards).length > 0;
/** Whether the player to move may trade a set now: while reinforcing, and in the middle of an attack only while it must. */
export const mayTrade = (s: State) => s.phase === "reinforce" && setsIn(s.seats[s.turn].cards).length > 0 && (!s.resume || mustTrade(s));
/** Territories `from` can attack: neighbours held by another (the neutral army's included). */
export function targets(s: State, from: number) {
  if (s.phase === "over" || settingUp(s) || s.owner[from] !== s.turn || s.armies[from] < 2) return [];
  return s.map.territories[from].neighbours.filter((n) => s.owner[n] !== s.turn);
}
/** Territories of the holder of `from` that armies can reach along territories of its own. */
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
/** Where the move at the end of a turn may take armies from `from`: a neighbour of one's own, or (by the other rule) anywhere along one's own. */
export function moveTargets(s: State, from: number) {
  if (s.move === "connected") return reachable(s, from);
  return s.map.territories[from].neighbours.filter((n) => s.owner[n] === s.owner[from]).sort((a, b) => a - b);
}
/** The players still in, in seat order (the neutral army is never a player). */
export const alive = (s: State) => s.seats.flatMap((seat, p) => (seat.alive && !seat.neutral ? [p] : []));
/** Whether `player` has done its secret mission. */
export function missionDone(s: State, player: number) {
  const mission = s.seats[player]?.mission;
  if (!mission) return false;
  if (mission.kind === "continents") {
    const held = continentsOf(s, player).map((c) => c.id);
    return mission.continents.every((c) => held.includes(c)) && (!mission.extra || held.some((c) => !mission.continents.includes(c)));
  }
  if (mission.kind === "territories") return s.owner.reduce((n, o, t) => n + (o === player && s.armies[t] >= mission.armies ? 1 : 0), 0) >= mission.count;
  return !s.seats[mission.target].alive && s.seats[mission.target].by === player;
}
/** Ends the game if someone has won: the last player in, the whole world taken, a mission done, every capital held, or no person left. */
function settle(s: State) {
  if (s.phase === "over" || settingUp(s)) return s;
  const left = alive(s);
  if (left.length === 1) return over(s, left, s.owner.every((o) => o === left[0]) ? "conquest" : "alone");
  const first = s.owner[0];
  if (s.owner.every((o) => o === first)) return over(s, [first], "conquest");
  // A mission is done the moment its holder, playing, does it.
  if (s.mode === "missions" && missionDone(s, s.turn)) return over(s, [s.turn], "mission");
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
/** The next seat after `from` that plays (never the neutral army, never one knocked out) and, if asked, that has armies to set down. */
function nextSeat(s: State, from: number, pooled = false) {
  let next = from;
  for (let k = 0; k < s.seats.length; k++) {
    next = (next + 1) % s.seats.length;
    const seat = s.seats[next];
    if (seat.alive && !seat.neutral && (!pooled || s.pool[next] > 0)) return next;
  }
  return -1;
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
  const next = nextSeat(s, previous);
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
/** After a conquest is settled: a hand grown to six or more by a player's cards taken is traded and placed first. */
function afterConquest(s: State) {
  s.pending = null;
  if (s.phase === "over") return s;
  if (s.seats[s.turn].cards.length >= TAKEN_TRADE && setsIn(s.seats[s.turn].cards).length) {
    s.phase = "reinforce";
    s.resume = true;
    s.reserve = 0;
  } else s.phase = "attack";
  return settle(s);
}
/** A placement while setting up: claiming an empty territory, or one more army on one's own (or on the neutral army's). */
function setUp(state: State, territory: number, count: number, random: Random): State | null {
  const me = state.turn,
    holder = state.owner[territory];
  if (state.phase === "claim") {
    if (holder !== -1 || count !== 1 || state.pool[me] < 1) return null;
    const s = copy(state);
    s.owner[territory] = me;
    s.armies[territory] = 1;
    s.pool[me]--;
    s.last = { kind: "place", player: me, territory, count: 1, claim: true };
    s.ply++;
    if (s.owner.includes(-1)) s.turn = nextSeat(s, me);
    else {
      // Everything is claimed: the players go on, a single army at a time, on their own territories.
      s.phase = "deploy";
      const next = nextSeat(s, me, true);
      if (next < 0) return ready(s, random);
      s.turn = next;
    }
    return s;
  }
  // Deploying.
  const quota = state.quota;
  if (quota) {
    // A game for two: two of one's own, then one of the neutral army's on a territory of its.
    const onNeutral = holder === state.neutral;
    if (onNeutral ? count !== 1 || quota.neutral < 1 : holder !== me || count < 1 || count > quota.own) return null;
    const s = copy(state),
      q = s.quota!;
    s.armies[territory] += count;
    if (onNeutral) {
      s.pool[s.neutral]--;
      q.neutral--;
    } else {
      s.pool[me] -= count;
      q.own -= count;
    }
    s.last = { kind: "place", player: me, territory, count, neutral: onNeutral };
    s.ply++;
    if (q.own > 0 || q.neutral > 0) return s;
    const next = nextSeat(s, me, true);
    if (next < 0) return ready(s, random);
    s.turn = next;
    s.quota = quotaFor(s, next);
    return s;
  }
  if (holder !== me || count !== 1 || state.pool[me] < 1) return null;
  const s = copy(state);
  s.armies[territory]++;
  s.pool[me]--;
  s.last = { kind: "place", player: me, territory, count: 1 };
  s.ply++;
  const next = nextSeat(s, me, true);
  if (next < 0) return ready(s, random);
  s.turn = next;
  return s;
}
/** The state after `action` by the player to move, or null when it is not allowed. Dice and cards draw from `random`. */
export function play(state: State, action: Action, random: Random): State | null {
  if (state.phase === "over") return null;
  const me = state.turn,
    map = state.map,
    valid = (t: number) => Number.isInteger(t) && t >= 0 && t < map.territories.length;
  if (settingUp(state)) return action.type === "place" && valid(action.territory) && Number.isInteger(action.count) ? setUp(state, action.territory, action.count, random) : null;
  switch (action.type) {
    case "trade": {
      if (!mayTrade(state) || new Set(action.cards).size !== 3) return null;
      const hand = state.seats[me].cards,
        cards = action.cards.map((id) => hand.find((c) => c.id === id));
      if (cards.some((c) => !c) || !isSet(cards as Card[])) return null;
      // Two armies on one territory named on the cards traded, if the player holds one: the one asked for, or the first.
      const named = bonusTerritories(state, me, action.cards);
      if (action.bonus !== undefined && action.bonus >= 0 && !named.includes(action.bonus)) return null;
      const s = copy(state),
        value = setValue(s.trades),
        bonus = action.bonus !== undefined && named.includes(action.bonus) ? action.bonus : (named[0] ?? -1);
      s.seats[me].cards = hand.filter((c) => !action.cards.includes(c.id));
      s.discard.push(...(cards as Card[]));
      s.trades++;
      s.reserve += value;
      if (bonus >= 0) s.armies[bonus] += CARD_BONUS;
      s.last = { kind: "trade", player: me, value, cards: cards as Card[], bonus };
      s.ply++;
      return settle(s);
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
      return settle(s);
    }
    case "attack": {
      const { from, to } = action;
      if (state.phase !== "attack" || !valid(from) || !valid(to) || !targets(state, from).includes(to)) return null;
      // The attacker rolls up to three dice, always fewer than its armies; it may choose to roll fewer.
      const most = attackDice(state.armies[from]),
        chosen = action.dice === undefined ? most : action.dice;
      if (!Number.isInteger(chosen) || chosen < 1 || chosen > most) return null;
      const s = copy(state),
        defender = s.owner[to],
        rolls: Roll[] = [];
      let a = s.armies[from],
        d = s.armies[to],
        dice = 0;
      do {
        dice = Math.min(chosen, attackDice(a));
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
      // Taken: at least as many armies as rolled the last dice go in, and more may follow.
      s.owner[to] = me;
      s.armies[to] = dice;
      s.armies[from] = a - dice;
      s.conquered = true;
      const loser = s.seats[defender],
        eliminated = !loser.neutral && !s.owner.includes(defender),
        taken = eliminated ? loser.cards.length : 0;
      if (eliminated) {
        loser.alive = false;
        loser.by = me;
        s.seats[me].cards.push(...loser.cards);
        loser.cards = [];
        // Another's mission to knock out that player can no longer be done: it becomes the larger number of territories.
        const { most: count } = missionCounts(map);
        s.seats.forEach((seat, p) => {
          if (p !== me && seat.mission?.kind === "destroy" && seat.mission.target === defender) seat.mission = { kind: "territories", count, armies: 1 };
        });
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
      if (state.phase !== "fortify" || !valid(from) || !valid(to) || state.owner[from] !== me || !moveTargets(state, from).includes(to)) return null;
      if (!Number.isInteger(count) || count < 1 || count > state.armies[from] - 1) return null;
      const s = copy(state);
      s.armies[from] -= count;
      s.armies[to] += count;
      s.ply++;
      s.last = { kind: "fortify", player: me, from, to, count };
      if (settle(s).phase === "over") return s;
      endTurn(s, random);
      // The move is what is shown, though the turn has passed with it.
      if (s.phase !== "over") s.last = { kind: "fortify", player: me, from, to, count };
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
