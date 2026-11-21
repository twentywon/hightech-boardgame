import { cryptoRandom, type Random } from "../../core/random";
import type { GameOptions, Move, PointGame, Winner } from "../points/types";
import { HEXES, NEIGHBOURS, RING2 } from "./board";
import { CAPITAL, CITY, NONE, PORT, VILLAGE, generateMap, seeded, type HexMap } from "./map";

/*
 * 헥스 정복전 (HEX CONQUEST): a game of armies on a map of hexes, in the manner of the old Flash game Hex Empire (only
 * its rules were taken; alliances and speeches are our own). Every change is one call of `play`, which never changes
 * the state it is given and answers null to a move the rules do not allow. Free of Three.js and DOM. The rules as
 * they are played here:
 *
 * Board. 20 columns by 11 rows of hexes (`board.ts`), each land or water, drawn at random (`map.ts`). Land may hold
 * an estate: a capital (수도), a city (도시), a village (마을) or a port (항구, on a coast). A land hex has an owner, a
 * nation or none; water has none.
 *
 * Nations. Four corners, a capital near each: 홍국 (lower left), 청국 (upper left), 황국 (upper right) and 흑국 (lower
 * right), played in the order 청국, 홍국, 황국, 흑국 (`ORDER`; the user asked). I play one of them (`me`) and 1–3 computers play others. With one computer it takes
 * the corner diagonally across from mine; with two, that one and the corner across the width of the map from mine
 * (on my side, top or bottom), so that the empty corner is the one above or below mine. An unused corner is plain
 * land with no nation and no capital. Each nation begins with one army of 10 men and morale 10 at its capital, and
 * owns its capital and the plain land round it.
 *
 * Setup. A game begins in the setup phase, with the map shown as it would be played. `NEW_MAP` (다른 맵) draws
 * another map from the `random` given to `play`; `NATION + n`, or a tap on the hex of corner n's capital, makes
 * nation n mine (the computers are seated again round it); `START` (시작) begins play with the first nation present
 * in the order of play, whoever it is. Nothing moves before that.
 *
 * Army. `count` men (1–99) and `morale` (0..count); its power is count + morale. A nation's morale is the average of
 * its armies' morale, rounded down (10 with no army).
 *
 * A turn. A nation moves up to min(5, its armies at the start of the turn) times, each army at most once. A move:
 *  - an army on land goes to a land hex next to it, or two steps away when a hex between is plain land with no army;
 *  - from a port also onto the water next to it, or two steps over water when the water between is empty;
 *  - an army at sea goes one or two steps over water (the water between empty), or lands: onto any land hex next to
 *    it, estates included, or two steps away when the hex between is empty water. A landing onto an army of another
 *    nation attacks it (the battle as below; if it wins it stands there, ashore), onto one of its own joins it;
 *  - onto an army of its own nation it joins it: the counts are added and the morale weighted,
 *    ⌊(c1·m1 + c2·m2) / (c1 + c2)⌋; past 99 men the joined army holds 99 and the rest stay behind with their morale
 *    (an army of 99 cannot be joined);
 *  - onto an army of another nation it attacks (below); onto an empty hex it goes there.
 * The joined army and anything left behind count as moved. `END` (턴 종료) ends the turn early; the turn also ends by
 * itself once the moves are used up or no army has a move left. At the end of a nation's turn its speech, if it gave
 * one that turn, wears off (below); then every army of it that did not move loses 1 morale; then reinforcements come.
 * Every capital it holds gives 30 men, every city 20 and every village 10 (the user asked for 10 and 20; the capital
 * stays the most); ports and plain land give none. They join an army of its own
 * standing there (its morale unchanged, at most 99 men) or stand as a new army with the nation's average morale.
 *
 * Battle. Attacker's power greater than the defender's: the defender is destroyed, the attacker moves in with
 * count − ⌊defender power × count ÷ attacker power⌋ men (at least 1), and every army of the defender's nation loses
 * ⌊defender count ÷ 10⌋ morale. Otherwise (equal or less) the attacker is destroyed, the defender keeps
 * count − ⌊attacker power × attacker count ÷ defender power⌋ (at least 1), and every army of the attacker's nation
 * loses ⌊attacker count ÷ 10⌋ morale. Morale is then capped by count. No dice.
 *
 * Taking land. An army that comes onto a land hex (by moving, joining or winning) takes it if it is not its nation's,
 * and every plain land hex round it with no army that is neither its nation's nor an ally's becomes its nation's too
 * (as in the game the rules come from, this happens on its own land as well). Morale gained (the army that took it,
 * and then every army of its nation, that army included): a nation's own capital, which conquers that nation, +30
 * and +50; a capital held by another nation +20 and +30; a city +15 and +15; a village +10 and +10; a port +5 and
 * +5; each plain land hex taken 0 and +1. The nation that held it loses on every army: a city 15, a village 10, a
 * port 5, a capital it held that was not its own 30. Morale never goes above count or below 0, and after every move
 * and every turn's end never below ⌊the nation's total count ÷ 50⌋ (but not above count).
 *
 * Alliances (동맹). While three or more nations stand, the nation to move may offer an alliance, once a turn to each
 * nation still standing that is not its ally; an offer spends none of the five moves. I offer with `PROPOSE`
 * (동맹 제안) and then `NATION + n` or a tap on n's capital (`PROPOSE` again takes the offer back). A computer answers
 * at once: it refuses when it dominates the field (`dominates`: its power, count + morale over all its armies, is
 * the greatest and at least 1.3 × the next nation's, or more than 40% of every nation's together) and accepts
 * otherwise. An offer a computer makes to me waits for my next turn, which then begins in the offer phase: `ACCEPT`
 * (수락) or `REFUSE` (거절) for each nation that offered. Allies' armies do not attack each other, and the plain land
 * round a hex taken never takes an ally's hexes (their borders hold). Moving onto an ally's hex or attacking an
 * ally's army is allowed, but ends that alliance at once, before the move. The computers never do it. When every
 * nation still standing is allied with every other, all alliances end by themselves; a nation that is out loses its
 * alliances, and one that comes back has none.
 *
 * Speech (연설). Once a game each nation may give a speech on its own turn while its morale has fallen: its armies'
 * total morale below half their total count (the average morale below half the average count). It spends none of
 * the five moves. Every army of it then has morale equal to its count for the rest of the turn; each army remembers
 * the morale it had (an army joined since remembers the two values weighted by count, men left behind their own).
 * At the end of the turn every army of the nation that remembers a value has the lower of its morale and that value.
 *
 * Conquest. A nation whose own capital is taken is out: its armies vanish and its land goes to the conqueror. Any
 * other capital it held comes back to its own nation with an army of 99 men and morale 99 (as in the original). I
 * win when every other nation is out and lose when my capital is taken. After 300 rounds the game is drawn.
 *
 * People at one screen (로컬 2–4인, the user asked). `createLocal(people)` seats two to four people and no computer:
 * the corners no person takes are empty, as above. In setup player 1, then 2 and so on, take a corner each by a tap
 * on its capital (or `NATION + n`); a tap on a capital already taken opens the choice again from the player who took
 * it, and a tap once everyone has chosen is refused. Until they have chosen, the players still to choose are seated
 * by default (`localSeats`: the corners `seatsFor` would give, in the order of play), so `START` may be pressed at
 * any time. The order of play is still 청국, 홍국, 황국, 흑국, whoever holds them (`humans` says which player holds
 * which; player numbers count only in setup). Every rule is as above, every nation being a person's: an alliance
 * offered to a person waits, as one offered to me does, for that person's next turn (`offers` holds a bit for each
 * pair, `offerBit`); a capital comes back to its nation whoever plays it; and the last nation standing wins
 * (`winner` 0, `victor`). `turn` is 0 whenever a person is to move, so always in this mode.
 */
export { CAPITAL, CITY, NONE, PORT, VILLAGE } from "./map";
export type { HexMap } from "./map";
export const NATIONS = 4;
/** The most men in one army, the moves of a turn, and the rounds before a draw. */
export const MAX = 99,
  MOVES = 5,
  LIMIT = 300;
/** The army each nation begins with at its capital. */
export const START_ARMY = { count: 10, morale: 10 };
/** Reinforcements: each estate's men before its share of the land (and how many shares it takes; none now). */
export const CAPITAL_MEN = 30,
  CITY_MEN = 20,
  VILLAGE_MEN = 10,
  CAPITAL_SHARES = 0,
  CITY_SHARES = 0,
  VILLAGE_SHARES = 0;
/** The order of play by corner: 청국 (upper left), 홍국, 황국, 흑국. */
export const ORDER: readonly number[] = [1, 0, 2, 3];
/** Morale for taking an estate (the army, every army) and lost by the nation that held it. */
export const GAIN = {
  conquest: [30, 50, 0],
  capital: [20, 30, 30],
  city: [15, 15, 15],
  village: [10, 10, 10],
  port: [5, 5, 5],
} as const;
/** A nation dominates the field (and refuses an alliance) at this many times the next one's power, or this share of all. */
export const DOMINANT_LEAD = 1.3,
  DOMINANT_SHARE = 0.4;
/** Moves that are points off the board. */
export const END = 1000,
  NEW_MAP = 1001,
  START = 1002,
  SPEECH = 1003,
  PROPOSE = 1004,
  ACCEPT = 1005,
  REFUSE = 1006,
  /** `NATION + n` chooses nation n: mine in setup, the one offered an alliance otherwise. */
  NATION = 1010;
/** Each nation's name and colour by corner: lower left, upper left, upper right, lower right. */
export const NAMES = ["홍국", "청국", "황국", "흑국"] as const;
export const COLORS = ["#c8402f", "#2f68c4", "#e0aa1c", "#3a3d44"] as const;
/** Which corners play when I hold `me` with this many computers: mine, the diagonal, then the one across the width. */
export function seatsFor(me: number, computers: number) {
  const k = Math.min(3, Math.max(1, Math.round(computers)));
  if (k === 3) return [0, 1, 2, 3];
  const seats = [me, me ^ 2];
  if (k === 2) seats.push(3 - me);
  return seats.sort((a, b) => a - b);
}
/** How many people may sit at one screen. */
export const PEOPLE_MIN = 2,
  PEOPLE_MAX = 4;
/**
 * The corners of `people` players at one screen, by player, when the first `chosen` have taken theirs: the rest are
 * seated where `seatsFor` would put the others round player 1's corner (홍국 when nobody has chosen), in the order of
 * play, then on any corner left.
 */
export function localSeats(chosen: readonly number[], people: number) {
  const k = Math.min(PEOPLE_MAX, Math.max(PEOPLE_MIN, Math.round(people) || PEOPLE_MIN)),
    seats = chosen.slice(0, k),
    near = seatsFor(seats[0] ?? 0, k - 1);
  for (const n of [...ORDER.filter((n) => near.includes(n)), ...ORDER]) if (seats.length < k && !seats.includes(n)) seats.push(n);
  return seats;
}
export interface Army {
  nation: number;
  count: number;
  morale: number;
  moved: boolean;
  /** The morale it had before its nation's speech this turn (see Speech). */
  rally?: number;
}
export interface Nation {
  /** Plays in this game (a corner left empty does not). */
  present: boolean;
  /** Still holds its own capital. */
  alive: boolean;
  capital: number;
}
/** What the last move did, for the board to animate and the screen to call out. */
export interface Last {
  nation: number;
  kind: "move" | "join" | "attack" | "end" | "setup" | "start" | "propose" | "pact" | "answer" | "speech";
  from: number;
  to: number;
  /** The hex the army passed over on a move of two steps, or -1. */
  via: number;
  /** The armies before the move (the one moving, and what stood where it went). */
  mover: Army | null;
  target: Army | null;
  /** A battle won by the one attacking. */
  won: boolean;
  /** Men left behind where a join ran past 99. */
  left: number;
  /** Hexes whose owner changed, and what was taken: an estate or a whole nation. */
  taken: number[];
  captured: "conquest" | "capital" | "city" | "village" | "port" | null;
  conquered: number;
  restored: number[];
  /** Hexes that took reinforcements at the ends of turns this move brought about, and whose turns those were. */
  spawned: number[];
  ended: number[];
  /** An alliance offered (`to` the nation asked; `accepted` null while the answer waits for my turn). */
  pact: { from: number; to: number; accepted: boolean | null } | null;
  /** The ally whose alliance this move broke, or -1; every alliance ended because all stood allied. */
  broken: number;
  dissolved: boolean;
}
export type Phase = "setup" | "play" | "propose" | "offer";
export interface State {
  /** The map with all four capitals, as drawn; `map` is it as played (unused corners plain). */
  world: HexMap;
  map: HexMap;
  phase: Phase;
  /** The nation I play, and how many computers play (with people at one screen: player 1's nation, and none). */
  me: number;
  computers: number;
  /** People at one screen (0 against the computer), the nation of each player in turn, and how many have chosen in setup. */
  people: number;
  humans: number[];
  picked: number;
  /** Each hex's owner (-1 for none). */
  owner: number[];
  armies: (Army | null)[];
  nations: Nation[];
  /** Each nation's allies, a bit a nation. */
  allies: number[];
  /** The nations the one to move has offered an alliance this turn (bits), and the offers waiting for a person's answer (`offerBit`). */
  asked: number;
  offers: number;
  /** Each nation's speech given, and the nation whose speech is in force this turn (-1 for none). */
  speeches: boolean[];
  speaking: number;
  /** The nation to move, its moves left and its moves this turn. */
  seat: number;
  left: number;
  budget: number;
  /** Rounds so far (from 1). */
  round: number;
  ply: number;
  winner: Winner;
  last: Last | null;
}
export const allied = (s: State, a: number, b: number) => a >= 0 && b >= 0 && a !== b && !!(s.allies[a] & (1 << b));
/** Whether a person plays `nation`: me against the computer, any player's nation at one screen. */
export const human = (s: State, nation: number) => (s.people ? s.humans.includes(nation) : nation === s.me);
/** The bit in `offers` of an alliance `from` offered and `to` has still to answer. */
export const offerBit = (from: number, to: number) => 1 << (to * NATIONS + from);
/** The nation that has won: the last standing (or none yet). */
export const victor = (s: State) => (s.winner === 0 ? (s.people ? (standingNations(s)[0] ?? -1) : s.me) : -1);
const plainEmpty = (s: State, h: number) => s.map.land[h] && s.map.estate[h] === NONE && !s.armies[h];
const emptyWater = (s: State, h: number) => !s.map.land[h] && !s.armies[h];
/** Where the army on `from` may go, each with the hex it passes over (-1 for a single step). */
export function destinations(s: State, from: number): { to: number; via: number }[] {
  const army = s.armies[from];
  if (!army) return [];
  const { land, estate } = s.map,
    out = new Map<number, number>(),
    enter = (h: number, via: number) => {
      if (out.has(h) && out.get(h) === -1) return;
      const there = s.armies[h];
      if (there && there.nation === army.nation && there.count >= MAX) return;
      if (!out.has(h) || via === -1) out.set(h, via);
    };
  if (land[from]) {
    for (const n of NEIGHBOURS[from]) if (land[n]) enter(n, -1);
    for (const { to, via } of RING2[from]) {
      if (!land[to]) continue;
      const m = via.find((x) => plainEmpty(s, x));
      if (m !== undefined) enter(to, m);
    }
    if (estate[from] === PORT) {
      for (const n of NEIGHBOURS[from]) if (!land[n]) enter(n, -1);
      for (const { to, via } of RING2[from]) {
        if (land[to]) continue;
        const m = via.find((x) => emptyWater(s, x));
        if (m !== undefined) enter(to, m);
      }
    }
  } else {
    // At sea: water a step or two away, and any land next to it or beyond one hex of empty water.
    for (const n of NEIGHBOURS[from]) enter(n, -1);
    for (const { to, via } of RING2[from]) {
      const m = via.find((x) => emptyWater(s, x));
      if (m !== undefined) enter(to, m);
    }
  }
  return [...out].map(([to, via]) => ({ to, via }));
}
/** The armies of `nation` that may still move, and where. */
export function movable(s: State, nation = s.seat) {
  const out: number[] = [];
  if (s.phase !== "play") return out;
  for (let h = 0; h < HEXES; h++) {
    const a = s.armies[h];
    if (a && a.nation === nation && !a.moved && destinations(s, h).length) out.push(h);
  }
  return out;
}
/** A nation's armies, men and morale (its armies' average, 10 with none), its power, and what it holds. */
export function standing(s: State, nation: number) {
  let armies = 0,
    men = 0,
    morale = 0,
    villages = 0,
    cities = 0,
    ports = 0,
    plain = 0,
    capitals = 0,
    land = 0;
  for (let h = 0; h < HEXES; h++) {
    const a = s.armies[h];
    if (a && a.nation === nation) {
      armies++;
      men += a.count;
      morale += a.morale;
    }
    if (s.owner[h] !== nation) continue;
    land++;
    const e = s.map.estate[h];
    if (e === VILLAGE) villages++;
    else if (e === CITY) cities++;
    else if (e === PORT) ports++;
    else if (e === CAPITAL) capitals++;
    else plain++;
  }
  return { armies, men, morale: armies ? Math.floor(morale / armies) : 10, totalMorale: morale, power: men + morale, villages, cities, ports, plain, capitals, land };
}
/** The nations still in the game. */
/** The nations still in the game, in the order of play. */
export const standingNations = (s: State) => ORDER.filter((i) => s.nations[i].present && s.nations[i].alive);
/** The share of the land behind each estate's reinforcements (see A turn). */
export function share(s: State, nation: number) {
  const { villages, cities, plain, ports } = standing(s, nation);
  return villages + cities ? Math.floor((plain + 5 * ports) / (villages + cities)) : 0;
}
/** The men an estate of `nation` raises at the end of its turn. */
export function reinforcement(s: State, nation: number, estate: number) {
  const k = share(s, nation);
  if (estate === CAPITAL) return CAPITAL_MEN + CAPITAL_SHARES * k;
  if (estate === CITY) return CITY_MEN + CITY_SHARES * k;
  if (estate === VILLAGE) return VILLAGE_MEN + VILLAGE_SHARES * k;
  return 0;
}
/** Whether `nation` dominates the field: the greatest power by 1.3 times the next, or more than 40% of all. */
export function dominates(s: State, nation: number) {
  const nations = standingNations(s),
    powers = nations.map((n) => standing(s, n).power),
    total = powers.reduce((a, b) => a + b, 0),
    mine = standing(s, nation).power,
    next = Math.max(0, ...nations.filter((n) => n !== nation).map((n) => standing(s, n).power));
  if (!total || !mine) return false;
  return mine >= DOMINANT_LEAD * next || mine > DOMINANT_SHARE * total;
}
/** The nations `nation` may offer an alliance now. */
export function offerable(s: State, nation = s.seat) {
  const nations = standingNations(s);
  if (s.winner !== null || nations.length < 3 || !nations.includes(nation)) return [];
  return nations.filter((n) => n !== nation && !allied(s, nation, n) && !(s.asked & (1 << n)));
}
/** Whether a speech may be given by the nation to move now: once a game, on its turn, its morale below half its men. */
export function canSpeak(s: State, nation = s.seat) {
  if (s.winner !== null || s.phase !== "play" || s.seat !== nation || s.speeches[nation] || s.left <= 0) return false;
  const st = standing(s, nation);
  return st.armies > 0 && st.totalMorale * 2 < st.men;
}
const clone = (s: State): State => ({
  ...s,
  owner: [...s.owner],
  armies: s.armies.map((a) => a && { ...a }),
  nations: s.nations.map((n) => ({ ...n })),
  allies: [...s.allies],
  speeches: [...s.speeches],
  humans: [...s.humans],
});
const cap = (a: Army) => {
  a.morale = Math.max(0, Math.min(a.count, a.morale));
};
/** Adds `k` morale (or takes it) from every army of `nation`. */
function moraleAll(s: State, nation: number, k: number) {
  if (!k) return;
  for (const a of s.armies)
    if (a && a.nation === nation) {
      a.morale += k;
      cap(a);
    }
}
/** No army's morale below ⌊its nation's men ÷ 50⌋ (but not above its count). */
function floors(s: State) {
  const men = [0, 0, 0, 0];
  for (const a of s.armies) if (a) men[a.nation] += a.count;
  for (const a of s.armies)
    if (a) {
      cap(a);
      a.morale = Math.max(a.morale, Math.min(a.count, Math.floor(men[a.nation] / 50)));
    }
}
const ally = (s: State, a: number, b: number) => {
  s.allies[a] |= 1 << b;
  s.allies[b] |= 1 << a;
};
const unally = (s: State, a: number, b: number) => {
  s.allies[a] &= ~(1 << b);
  s.allies[b] &= ~(1 << a);
};
/** Every alliance ends once every nation still standing is allied with every other (the game could not end). */
function settleAlliances(s: State, last: Last) {
  const nations = standingNations(s);
  for (let n = 0; n < NATIONS; n++) if (!nations.includes(n)) for (let m = 0; m < NATIONS; m++) unally(s, n, m);
  if (!s.allies.some(Boolean)) return;
  if (nations.every((a) => nations.every((b) => a === b || allied(s, a, b)))) {
    s.allies = [0, 0, 0, 0];
    last.dissolved = true;
  }
}
/** The nation `loser` is out: its armies vanish, its land goes to `winner`, and capitals it held come back to theirs. */
function conquer(s: State, loser: number, winner: number, last: Last) {
  s.nations[loser].alive = false;
  last.conquered = loser;
  for (let h = 0; h < HEXES; h++) if (s.armies[h]?.nation === loser) s.armies[h] = null;
  for (let h = 0; h < HEXES; h++) {
    if (s.owner[h] !== loser) continue;
    const back = s.map.estate[h] === CAPITAL ? s.nations.findIndex((n) => n.capital === h) : -1;
    if (back >= 0 && back !== loser && (s.people > 0 || back !== s.me)) {
      s.nations[back].alive = true;
      s.owner[h] = back;
      s.armies[h] = { nation: back, count: MAX, morale: MAX, moved: false };
      last.restored.push(back);
      for (let m = 0; m < NATIONS; m++) unally(s, back, m);
      for (const n of NEIGHBOURS[h]) if (plainEmpty(s, n) && s.owner[n] === loser) s.owner[n] = back;
    } else {
      s.owner[h] = winner;
      last.taken.push(h);
    }
  }
  settleAlliances(s, last);
  // The plain land round a restored capital that was not the loser's stays where it is.
  if (s.people) {
    if (standingNations(s).length <= 1) s.winner = 0;
  } else if (loser === s.me) s.winner = 1;
  else if (s.nations.every((n, i) => i === s.me || !n.present || !n.alive)) s.winner = 0;
}
/** An army has come onto `h`: what it takes there and round it, and the morale that goes with it. */
function enter(s: State, h: number, army: Army, last: Last) {
  if (!s.map.land[h]) return;
  const nation = army.nation,
    before = s.owner[h];
  let self = 0,
    all = 0,
    conquered = -1;
  if (before !== nation) {
    const estate = s.map.estate[h],
      take = (kind: keyof typeof GAIN) => {
        const [a, b, lost] = GAIN[kind];
        self += a;
        all += b;
        if (before >= 0 && lost) moraleAll(s, before, -lost);
        if (!last.captured || kind !== "port") last.captured = kind;
      };
    if (estate === CAPITAL) {
      const whose = s.nations.findIndex((n) => n.capital === h);
      if (whose === before) {
        take("conquest");
        conquered = before;
      } else take("capital");
    } else if (estate === CITY) take("city");
    else if (estate === VILLAGE) take("village");
    else if (estate === PORT) take("port");
    else all += 1;
    s.owner[h] = nation;
    last.taken.push(h);
  }
  for (const n of NEIGHBOURS[h])
    if (plainEmpty(s, n) && s.owner[n] !== nation && !allied(s, nation, s.owner[n])) {
      s.owner[n] = nation;
      all += 1;
      last.taken.push(n);
    }
  army.morale += self;
  cap(army);
  moraleAll(s, nation, all);
  if (conquered >= 0) conquer(s, conquered, nation, last);
}
const blank = (nation: number, kind: Last["kind"], from = -1, to = -1, via = -1): Last => ({
  nation,
  kind,
  from,
  to,
  via,
  mover: null,
  target: null,
  won: false,
  left: 0,
  taken: [],
  captured: null,
  conquered: -1,
  restored: [],
  spawned: [],
  ended: [],
  pact: null,
  broken: -1,
  dissolved: false,
});
/** The ally whose alliance a move of the army on `from` to `to` would break, or -1. */
export function breaks(s: State, from: number, to: number) {
  const nation = s.armies[from]?.nation ?? s.seat,
    there = s.armies[to],
    other = there && there.nation !== nation ? there.nation : s.map.land[to] ? s.owner[to] : -1;
  return allied(s, nation, other) ? other : -1;
}
/** The morale a joined army remembers through a speech: the two values weighted by count. */
const rallyOf = (a: Army, b: Army, along: number) =>
  a.rally === undefined && b.rally === undefined
    ? undefined
    : Math.floor((along * (a.rally ?? a.morale) + b.count * (b.rally ?? b.morale)) / (along + b.count));
/**
 * The army on `from` moved to `to`, the turn not yet passed on (the computer weighs its moves so); null when the move
 * is not legal for the nation to move.
 */
export function moveOnly(s: State, from: number, to: number): State | null {
  if (s.winner !== null || s.phase !== "play" || s.left <= 0) return null;
  const army = s.armies[from];
  if (!army || army.nation !== s.seat || army.moved) return null;
  const way = destinations(s, from).find((d) => d.to === to);
  if (!way) return null;
  const n = clone(s),
    mover = n.armies[from]!,
    target = n.armies[to],
    last = blank(s.seat, target ? (target.nation === s.seat ? "join" : "attack") : "move", from, to, way.via);
  last.mover = { ...mover };
  last.target = target && { ...target };
  // Coming onto an ally's land or army ends that alliance first.
  const broken = breaks(s, from, to);
  if (broken >= 0) {
    unally(n, s.seat, broken);
    last.broken = broken;
  }
  n.armies[from] = null;
  mover.moved = true;
  if (target && target.nation === mover.nation) {
    const total = mover.count + target.count;
    if (total <= MAX) {
      const rally = rallyOf(mover, target, mover.count);
      target.morale = Math.floor((mover.count * mover.morale + target.count * target.morale) / total);
      target.count = total;
      if (rally !== undefined) target.rally = rally;
    } else {
      const along = MAX - target.count,
        rest = mover.count - along,
        rally = rallyOf(mover, target, along);
      target.morale = Math.floor((along * mover.morale + target.count * target.morale) / MAX);
      target.count = MAX;
      if (rally !== undefined) target.rally = rally;
      n.armies[from] = { nation: mover.nation, count: rest, morale: Math.min(mover.morale, rest), moved: true, ...(mover.rally === undefined ? {} : { rally: mover.rally }) };
      last.left = rest;
    }
    target.moved = true;
    cap(target);
    enter(n, to, target, last);
  } else if (target) {
    const attack = mover.count + mover.morale,
      defence = target.count + target.morale;
    if (attack > defence) {
      last.won = true;
      n.armies[to] = null;
      moraleAll(n, target.nation, -Math.floor(target.count / 10));
      mover.count = Math.max(1, mover.count - Math.floor((defence * mover.count) / attack));
      cap(mover);
      n.armies[to] = mover;
      enter(n, to, mover, last);
    } else {
      target.count = Math.max(1, target.count - Math.floor((attack * mover.count) / defence));
      cap(target);
      moraleAll(n, mover.nation, -Math.floor(mover.count / 10));
    }
  } else {
    n.armies[to] = mover;
    enter(n, to, mover, last);
  }
  floors(n);
  n.left = s.left - 1;
  n.last = last;
  return n;
}
/** Reinforcements for `nation` at the end of its turn; the hexes that took them. */
function reinforce(s: State, nation: number) {
  const { morale } = standing(s, nation),
    raised: [number, number][] = [],
    spawned: number[] = [];
  for (let h = 0; h < HEXES; h++) if (s.owner[h] === nation && s.map.estate[h] !== NONE) raised.push([h, reinforcement(s, nation, s.map.estate[h])]);
  for (const [h, men] of raised) {
    if (!men) continue;
    const a = s.armies[h];
    if (a && a.nation !== nation) continue;
    if (a) a.count = Math.min(MAX, a.count + men);
    else s.armies[h] = { nation, count: Math.min(MAX, men), morale: Math.min(morale, men), moved: false };
    cap(s.armies[h]!);
    spawned.push(h);
  }
  return spawned;
}
/** The nation to move begins its turn: its moves counted, and offers to a person waiting for an answer. */
function begin(s: State, nation: number) {
  s.seat = nation;
  s.asked = 0;
  s.budget = Math.min(MOVES, standing(s, nation).armies);
  s.left = s.budget;
  s.phase = "play";
  if (human(s, nation)) {
    // Offers from nations that have fallen, or that are allies already, lapse.
    for (let n = 0; n < NATIONS; n++) if (s.offers & offerBit(n, nation) && (!s.nations[n].alive || allied(s, n, nation))) s.offers &= ~offerBit(n, nation);
    if (offerFrom(s) >= 0) s.phase = "offer";
  }
}
/** The turn of the nation to move ends, and the next nation that can move begins its own. Changes `s`. */
function passOn(s: State, last: Last) {
  for (let guard = 0; guard < 12 && s.winner === null; guard++) {
    const nation = s.seat;
    if (s.speaking === nation) {
      for (const a of s.armies)
        if (a && a.nation === nation && a.rally !== undefined) {
          a.morale = Math.min(a.morale, a.rally);
          delete a.rally;
        }
      s.speaking = -1;
    }
    for (const a of s.armies)
      if (a && a.nation === nation) {
        if (!a.moved) a.morale = Math.max(0, a.morale - 1);
        a.moved = false;
      }
    last.spawned.push(...reinforce(s, nation));
    last.ended.push(nation);
    floors(s);
    // The next nation still in the game, a new round when the order comes back round.
    let at = ORDER.indexOf(nation),
      next = nation,
      wrapped = false;
    do {
      at = (at + 1) % NATIONS;
      if (at === 0) wrapped = true;
      next = ORDER[at];
    } while (!(s.nations[next].present && s.nations[next].alive));
    if (wrapped) s.round++;
    if (s.round > LIMIT) {
      s.winner = "draw";
      return;
    }
    begin(s, next);
    if (s.phase === "offer" || (s.left > 0 && movable(s, next).length)) return;
  }
}
/** The map as played and the nations on it, for `world` with these corners seated. */
function lay(world: HexMap, seats: readonly number[]) {
  const owner = new Array<number>(HEXES).fill(-1),
    armies: (Army | null)[] = new Array(HEXES).fill(null);
  const nations: Nation[] = world.corners.map((capital, i) => ({ present: seats.includes(i), alive: seats.includes(i), capital: seats.includes(i) ? capital : -1 }));
  // An unused corner is plain land: no capital there.
  const estate = world.estate.map((e, h) => (e === CAPITAL && !nations.some((n) => n.capital === h) ? NONE : e));
  const map: HexMap = { ...world, estate };
  for (const i of seats) {
    const c = world.corners[i];
    owner[c] = i;
    armies[c] = { nation: i, ...START_ARMY, moved: false };
    for (const n of NEIGHBOURS[c]) if (map.land[n] && map.estate[n] === NONE) owner[n] = i;
  }
  return { map, owner, armies, nations };
}
/** A state in setup with `world`, me on corner `me`. */
function setupState(world: HexMap, computers: number, me: number, ply: number): State {
  const k = Math.min(3, Math.max(1, Math.round(computers) || 3));
  return {
    world,
    ...lay(world, seatsFor(me, k)),
    phase: "setup",
    me,
    computers: k,
    people: 0,
    humans: [],
    picked: 0,
    allies: [0, 0, 0, 0],
    asked: 0,
    offers: 0,
    speeches: [false, false, false, false],
    speaking: -1,
    seat: me,
    left: 0,
    budget: 0,
    round: 1,
    ply,
    winner: null,
    last: null,
  };
}
/** A new game with `computers` computers (1–3), its map drawn from `random`, in setup with me on corner `me`. */
export function createGame(computers = 3, random: Random = cryptoRandom, me = 0): State {
  return setupState(generateMap(seeded(random())), computers, me, 0);
}
/** A state in setup for `people` at one screen, the first `picked` of `chosen` having taken their corners. */
function localState(world: HexMap, people: number, chosen: readonly number[], picked: number, ply: number): State {
  const humans = localSeats(chosen.slice(0, picked), people);
  return {
    ...setupState(world, 1, humans[0], ply),
    ...lay(world, humans),
    computers: 0,
    people: humans.length,
    humans,
    picked: Math.min(picked, humans.length),
  };
}
/** A new game for `people` (2–4) at one screen, its map drawn from `random`, in setup with nobody's corner chosen yet. */
export function createLocal(people = 2, random: Random = cryptoRandom): State {
  return localState(generateMap(seeded(random())), people, [], 0, 0);
}
/** People at one screen when the setup window gave `people` (offered only then), else me against the computers. */
export const create = (_variant: string, options: GameOptions = {}) =>
  options.people !== undefined ? createLocal(Number(options.people) || PEOPLE_MIN) : createGame(Number(options.computers) || 3);
/** Every legal move of the nation to move (in setup, mine). */
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  const out: Move[] = [],
    tool = (to: number) => out.push({ from: -1, to, extra: -1 });
  if (s.phase === "setup") {
    tool(NEW_MAP);
    for (let n = 0; n < NATIONS; n++) {
      // At one screen, once everyone has chosen only a capital taken already may be tapped (to choose again).
      if (s.people && s.picked >= s.people && !s.humans.includes(n)) continue;
      tool(NATION + n);
      tool(s.world.corners[n]);
    }
    tool(START);
    return out;
  }
  if (s.phase === "offer") {
    tool(ACCEPT);
    tool(REFUSE);
    return out;
  }
  const open = offerable(s);
  if (s.phase === "propose") {
    for (const n of open) {
      tool(NATION + n);
      tool(s.nations[n].capital);
    }
    tool(PROPOSE);
    return out;
  }
  for (const h of movable(s)) for (const d of destinations(s, h)) out.push({ from: h, to: d.to, extra: -1 });
  tool(END);
  if (canSpeak(s)) tool(SPEECH);
  if (open.length) {
    tool(PROPOSE);
    for (const n of open) tool(NATION + n);
  }
  return out;
}
/** The first nation that offered the nation to move an alliance and waits for its answer, or -1. */
export function offerFrom(s: State) {
  for (let n = 0; n < NATIONS; n++) if (s.offers & offerBit(n, s.seat)) return n;
  return -1;
}
/** An offer of an alliance from the nation to move to `to`. */
function offer(s: State, to: number): State | null {
  if (!offerable(s).includes(to)) return null;
  const n = clone(s),
    last = blank(s.seat, "pact", -1, to);
  n.asked |= 1 << to;
  n.phase = "play";
  if (human(s, to)) {
    n.offers |= offerBit(s.seat, to);
    last.pact = { from: s.seat, to, accepted: null };
  } else {
    const yes = !dominates(s, to);
    last.pact = { from: s.seat, to, accepted: yes };
    if (yes) ally(n, s.seat, to);
    settleAlliances(n, last);
  }
  n.last = last;
  return n;
}
/** The nation whose capital stands on `h` and that may be offered an alliance now, or -1. */
const capitalOf = (s: State, h: number) => s.nations.findIndex((n) => n.present && n.capital === h);
export function play(s: State, move: Move, random: Random = cryptoRandom): State | null {
  if (s.winner !== null) return null;
  const { to } = move,
    tool = move.from === -1 && move.extra === -1;
  let next: State;
  if (s.phase === "setup") {
    if (!tool) return null;
    const corner = s.world.corners.indexOf(to),
      chosen = to >= NATION && to < NATION + NATIONS ? to - NATION : corner;
    if (to === NEW_MAP) next = s.people ? localState(generateMap(seeded(random())), s.people, s.humans, s.picked, s.ply) : setupState(generateMap(seeded(random())), s.computers, s.me, s.ply);
    else if (chosen >= 0 && s.people) {
      // A capital taken already opens the choice again from its player; a free one goes to the player choosing now.
      const at = s.humans.slice(0, s.picked).indexOf(chosen);
      if (at >= 0) next = localState(s.world, s.people, s.humans, at, s.ply);
      else if (s.picked < s.people) next = localState(s.world, s.people, [...s.humans.slice(0, s.picked), chosen], s.picked + 1, s.ply);
      else return null;
    } else if (chosen >= 0) next = setupState(s.world, s.computers, chosen, s.ply);
    else if (to === START) {
      next = clone(s);
      begin(next, standingNations(next)[0]);
      next.last = blank(next.seat, "start");
      if (next.phase !== "offer" && !movable(next).length) passOn(next, next.last);
    } else return null;
    if (to !== START) next.last = blank(next.me, "setup", -1, to);
  } else if (s.phase === "offer") {
    if (!tool || (to !== ACCEPT && to !== REFUSE)) return null;
    const from = offerFrom(s);
    next = clone(s);
    next.offers &= ~offerBit(from, s.seat);
    next.last = blank(s.seat, "answer", -1, from);
    next.last.pact = { from, to: s.seat, accepted: to === ACCEPT };
    if (to === ACCEPT && next.nations[from].alive) ally(next, from, s.seat);
    settleAlliances(next, next.last);
    if (offerFrom(next) < 0) {
      next.phase = "play";
      if (next.left <= 0 || !movable(next).length) passOn(next, next.last);
    }
  } else if (s.phase === "propose") {
    if (!tool) return null;
    if (to === PROPOSE) {
      next = clone(s);
      next.phase = "play";
      next.last = blank(s.seat, "propose");
    } else {
      const nation = to >= NATION && to < NATION + NATIONS ? to - NATION : capitalOf(s, to);
      if (nation < 0) return null;
      const made = offer(s, nation);
      if (!made) return null;
      next = made;
    }
  } else if (tool && to === END) {
    next = clone(s);
    next.last = blank(s.seat, "end");
    passOn(next, next.last);
  } else if (tool && to === PROPOSE) {
    if (!offerable(s).length) return null;
    next = clone(s);
    next.phase = "propose";
    next.last = blank(s.seat, "propose");
  } else if (tool && to >= NATION && to < NATION + NATIONS) {
    const made = offer(s, to - NATION);
    if (!made) return null;
    next = made;
  } else if (tool && to === SPEECH) {
    if (!canSpeak(s)) return null;
    next = clone(s);
    next.speeches[s.seat] = true;
    next.speaking = s.seat;
    for (const a of next.armies)
      if (a && a.nation === s.seat) {
        a.rally = a.morale;
        a.morale = a.count;
      }
    next.last = blank(s.seat, "speech");
  } else {
    const moved = moveOnly(s, move.from, move.to);
    if (!moved) return null;
    next = moved;
    if (next.winner === null && (next.left <= 0 || !movable(next).length)) passOn(next, next.last!);
  }
  next.ply = s.ply + 1;
  return next;
}
const nameOf = (nation: number) => NAMES[nation];
export const hexConquest: PointGame<State> = {
  create,
  moves,
  play: (s, m, random) => play(s, m, random),
  turn: (s) => (s.phase === "setup" || human(s, s.seat) ? 0 : 1),
  winner: (s) => s.winner,
  owners: (s) => s.owner.map((o) => (o < 0 ? null : o === (s.people ? s.seat : s.me) ? 0 : 1)),
  effect: () => null,
  ply: (s) => s.ply,
  evaluate: (s, player) => {
    const mine = standing(s, s.me),
      theirs = [0, 1, 2, 3].filter((n) => n !== s.me).map((n) => standing(s, n)).reduce((a, b) => a + b.men + b.land, 0);
    const v = mine.men + mine.land - theirs / 3;
    return player === 0 ? v : -v;
  },
  hint: (s) => {
    if (s.phase === "setup" && s.people)
      return s.picked < s.people ? `${s.picked + 1}번 플레이어: 수도를 눌러 제국을 고르세요.` : "모두 골랐습니다. 다른 맵이나 시작을 누르세요.";
    if (s.phase === "setup") return "맵을 고르고, 수도를 눌러 제국을 고른 뒤 시작을 누르세요.";
    if (s.phase === "offer") return `${nameOf(offerFrom(s))}이 동맹을 제안했습니다. 수락 또는 거절을 고르세요.`;
    if (s.phase === "propose") return "동맹을 제안할 나라의 수도나 이름을 고르세요.";
    return `남은 이동 ${s.left}/${s.budget}${s.speaking === s.seat ? " · 연설 중" : ""} · 움직일 군대를 고르세요.`;
  },
  tally: (s) => {
    if (s.people) {
      const line = (n: number) => (s.nations[n].alive ? `${nameOf(n)} 병력 ${standing(s, n).men} · 사기 ${standing(s, n).morale}` : `${nameOf(n)} 멸망`);
      return [ORDER.filter((n) => s.nations[n].present).map(line).join(" · "), ""];
    }
    const me = standing(s, s.me);
    const others = [0, 1, 2, 3]
      .filter((n) => n !== s.me && s.nations[n].present)
      .map((n) => (s.nations[n].alive ? `${nameOf(n)} ${standing(s, n).men}${allied(s, n, s.me) ? " (동맹)" : ""}` : `${nameOf(n)} 멸망`));
    return [`${nameOf(s.me)} 병력 ${me.men} · 사기 ${me.morale} · 마을 ${me.villages} · 도시 ${me.cities}`, others.join(" · ")];
  },
  reason: (s) => {
    if (s.people && s.winner === 0) return `모든 나라를 정복했습니다. 세계가 ${nameOf(victor(s))}의 깃발 아래 하나가 되었습니다.`;
    const mine = nameOf(s.me);
    if (s.winner === 0) return `모든 나라를 정복했습니다. 세계가 ${mine}의 깃발 아래 하나가 되었습니다.`;
    if (s.winner === "draw") return `${LIMIT}바퀴가 지나 비겼습니다. 끝내 승부가 나지 않았습니다.`;
    const by = s.last && s.last.conquered === s.me ? s.last.nation : -1;
    return by >= 0 && by !== s.me ? `${nameOf(by)}이 ${mine}의 수도를 점령했습니다. 나라가 무너졌습니다.` : `${mine}의 수도가 함락되었습니다.`;
  },
};
