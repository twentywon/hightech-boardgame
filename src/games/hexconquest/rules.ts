import { cryptoRandom, type Random } from "../../core/random";
import type { GameOptions, Move, PointGame, Winner } from "../points/types";
import { HEXES, NEIGHBOURS, RING2 } from "./board";
import { CAPITAL, NONE, PORT, TOWN, generateMap, seeded, type HexMap } from "./map";

/*
 * 헥스 정복전 (HEX CONQUEST): a game of armies on a map of hexes, in the manner of the old Flash game Hex Empire (only
 * its rules were taken). Every change is one call of `play`, which never changes the state it is given and answers
 * null to a move the rules do not allow. Free of Three.js and DOM. The rules as they are played here:
 *
 * Board. 20 columns by 11 rows of hexes (`board.ts`), each land or water, drawn at random (`map.ts`). Land may hold a
 * capital, a town or a port (a port stands on a coast). A land hex has an owner, a nation or none; water has none.
 *
 * Nations. Four corners, a capital near each; I am nation 0 (lower left), the computers 1 (upper left), 2 (upper
 * right) and 3 (lower right) in that order of play. With one computer it is nation 2, with two nations 1 and 2; an
 * unused corner is plain land with no nation and no capital. Each nation begins with one army of 10 men and morale
 * 10 at its capital, and owns its capital and the plain land round it.
 *
 * Army. `count` men (1–99) and `morale` (0..count); its power is count + morale. A nation's morale is the average of
 * its armies' morale, rounded down (10 with no army).
 *
 * A turn. A nation moves up to min(5, its armies at the start of the turn) times, each army at most once. A move:
 *  - an army on land goes to a land hex next to it, or two steps away when a hex between is plain land with no army;
 *  - from a port also onto the water next to it, or two steps over water when the water between is empty;
 *  - an army at sea goes one or two steps over water (the water between empty), or onto land next to it; a coast with
 *    an army on it may be entered only where it is a port;
 *  - onto an army of its own nation it joins it: the counts are added and the morale weighted,
 *    ⌊(c1·m1 + c2·m2) / (c1 + c2)⌋; past 99 men the joined army holds 99 and the rest stay behind with their morale
 *    (an army of 99 cannot be joined);
 *  - onto an army of another nation it attacks (below); onto an empty hex it goes there.
 * The joined army and anything left behind count as moved. `END` (턴 종료) ends the turn early; the turn also ends by
 * itself once the moves are used up or no army has a move left. At the end of a nation's turn every army of it that
 * did not move loses 1 morale; then reinforcements come: every capital it holds +5 men, every town it holds
 * 5 + ⌊(its plain land hexes + 5 × its ports) ÷ its towns⌋ men. They join an army of its own standing there (its
 * morale unchanged, at most 99 men) or stand as a new army with the nation's average morale.
 *
 * Battle. Attacker's power greater than the defender's: the defender is destroyed, the attacker moves in with
 * count − ⌊defender power × count ÷ attacker power⌋ men (at least 1), and every army of the defender's nation loses
 * ⌊defender count ÷ 10⌋ morale. Otherwise (equal or less) the attacker is destroyed, the defender keeps
 * count − ⌊attacker power × attacker count ÷ defender power⌋ (at least 1), and every army of the attacker's nation
 * loses ⌊attacker count ÷ 10⌋ morale. Morale is then capped by count. No dice.
 *
 * Taking land. An army that comes onto a land hex (by moving, joining or winning) takes it if it is not its nation's,
 * and every plain land hex round it with no army that is not its nation's becomes its nation's too (as in the game
 * the rules come from, this happens on its own land as well). Morale gained (the army that took it, and then every
 * army of its nation, that army included): a nation's own capital, which conquers that nation, +30 and +50; a capital
 * held by another nation +20 and +30; a town +10 and +10; a port +5 and +5; each plain land hex taken 0 and +1. The
 * nation that held it loses on every army: a town 10, a port 5, a capital it held that was not its own 30.
 * Morale never goes above count or below 0, and after every move and every turn's end never below
 * ⌊the nation's total count ÷ 50⌋ (but not above count).
 *
 * Conquest. A nation whose own capital is taken is out: its armies vanish and its land goes to the conqueror. Any
 * other capital it held comes back to its own nation with an army of 99 men and morale 99 (as in the original). I
 * win when every other nation is out and lose when my capital is taken. After 300 of my turns the game is drawn.
 * The original's pacts are left out.
 */
export { CAPITAL, NONE, PORT, TOWN } from "./map";
export type { HexMap } from "./map";
export const NATIONS = 4;
/** The most men in one army, the moves of a turn, and the turns before a draw. */
export const MAX = 99,
  MOVES = 5,
  LIMIT = 300;
/** The army each nation begins with at its capital. */
export const START = { count: 10, morale: 10 };
/** Reinforcements: a capital, and a town before its share of the land. */
export const CAPITAL_MEN = 5,
  TOWN_MEN = 5;
/** The move that ends the turn (턴 종료), a point off the board. */
export const END = 1000;
/** Each nation's name and colour: lower left (mine), upper left, upper right, lower right. */
export const NAMES = ["홍국", "청국", "황국", "흑국"] as const;
export const COLORS = ["#c8402f", "#2f68c4", "#e0aa1c", "#3a3d44"] as const;
/** Which nations play, by the number of computers. */
export const SEATS: Record<number, number[]> = { 1: [0, 2], 2: [0, 1, 2], 3: [0, 1, 2, 3] };
export interface Army {
  nation: number;
  count: number;
  morale: number;
  moved: boolean;
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
  kind: "move" | "join" | "attack" | "end";
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
  captured: "conquest" | "capital" | "town" | "port" | null;
  conquered: number;
  restored: number[];
  /** Hexes that took reinforcements at the ends of turns this move brought about, and whose turns those were. */
  spawned: number[];
  ended: number[];
}
export interface State {
  map: HexMap;
  /** Each hex's owner (-1 for none). */
  owner: number[];
  armies: (Army | null)[];
  nations: Nation[];
  /** The nation to move, its moves left and its moves this turn. */
  seat: number;
  left: number;
  budget: number;
  /** My turns so far (from 1). */
  round: number;
  ply: number;
  winner: Winner;
  last: Last | null;
}
const plainEmpty = (s: State, h: number) => s.map.land[h] && s.map.estate[h] === NONE && !s.armies[h];
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
        const m = via.find((x) => !land[x] && !s.armies[x]);
        if (m !== undefined) enter(to, m);
      }
    }
  } else {
    for (const n of NEIGHBOURS[from]) {
      if (!land[n]) enter(n, -1);
      // A coast with an army on it is entered only at a port.
      else if (!s.armies[n] || estate[n] === PORT) enter(n, -1);
    }
    for (const { to, via } of RING2[from]) {
      if (land[to]) continue;
      const m = via.find((x) => !land[x] && !s.armies[x]);
      if (m !== undefined) enter(to, m);
    }
  }
  return [...out].map(([to, via]) => ({ to, via }));
}
/** The armies of `nation` that may still move, and where. */
export function movable(s: State, nation = s.seat) {
  const out: number[] = [];
  for (let h = 0; h < HEXES; h++) {
    const a = s.armies[h];
    if (a && a.nation === nation && !a.moved && destinations(s, h).length) out.push(h);
  }
  return out;
}
/** A nation's armies, men and morale (its armies' average, 10 with none), and what it holds. */
export function standing(s: State, nation: number) {
  let armies = 0,
    men = 0,
    morale = 0,
    towns = 0,
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
    if (e === TOWN) towns++;
    else if (e === PORT) ports++;
    else if (e === CAPITAL) capitals++;
    else plain++;
  }
  return { armies, men, morale: armies ? Math.floor(morale / armies) : 10, towns, ports, plain, capitals, land };
}
const clone = (s: State): State => ({
  ...s,
  owner: [...s.owner],
  armies: s.armies.map((a) => a && { ...a }),
  nations: s.nations.map((n) => ({ ...n })),
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
/** The nation `loser` is out: its armies vanish, its land goes to `winner`, and capitals it held come back to theirs. */
function conquer(s: State, loser: number, winner: number, last: Last) {
  s.nations[loser].alive = false;
  last.conquered = loser;
  for (let h = 0; h < HEXES; h++) if (s.armies[h]?.nation === loser) s.armies[h] = null;
  for (let h = 0; h < HEXES; h++) {
    if (s.owner[h] !== loser) continue;
    const back = s.map.estate[h] === CAPITAL ? s.nations.findIndex((n) => n.capital === h) : -1;
    if (back >= 0 && back !== loser && back !== 0) {
      s.nations[back].alive = true;
      s.owner[h] = back;
      s.armies[h] = { nation: back, count: MAX, morale: MAX, moved: false };
      last.restored.push(back);
      for (const n of NEIGHBOURS[h]) if (plainEmpty(s, n) && s.owner[n] === loser) s.owner[n] = back;
    } else {
      s.owner[h] = winner;
      last.taken.push(h);
    }
  }
  // The plain land round a restored capital that was not the loser's stays where it is.
  if (loser === 0) s.winner = 1;
  else if (s.nations.every((n, i) => i === 0 || !n.present || !n.alive)) s.winner = 0;
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
    const estate = s.map.estate[h];
    if (estate === CAPITAL) {
      const whose = s.nations.findIndex((n) => n.capital === h);
      if (whose === before) {
        self += 30;
        all += 50;
        conquered = before;
        last.captured = "conquest";
      } else {
        self += 20;
        all += 30;
        if (before >= 0) moraleAll(s, before, -30);
        last.captured = "capital";
      }
    } else if (estate === TOWN) {
      self += 10;
      all += 10;
      if (before >= 0) moraleAll(s, before, -10);
      last.captured = "town";
    } else if (estate === PORT) {
      self += 5;
      all += 5;
      if (before >= 0) moraleAll(s, before, -5);
      if (!last.captured) last.captured = "port";
    } else all += 1;
    s.owner[h] = nation;
    last.taken.push(h);
  }
  for (const n of NEIGHBOURS[h])
    if (plainEmpty(s, n) && s.owner[n] !== nation) {
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
});
/**
 * The army on `from` moved to `to`, the turn not yet passed on (the computer weighs its moves so); null when the move
 * is not legal for the nation to move.
 */
export function moveOnly(s: State, from: number, to: number): State | null {
  if (s.winner !== null || s.left <= 0) return null;
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
  n.armies[from] = null;
  mover.moved = true;
  if (target && target.nation === mover.nation) {
    const total = mover.count + target.count;
    if (total <= MAX) {
      target.morale = Math.floor((mover.count * mover.morale + target.count * target.morale) / total);
      target.count = total;
    } else {
      const along = MAX - target.count,
        rest = mover.count - along;
      target.morale = Math.floor((along * mover.morale + target.count * target.morale) / MAX);
      target.count = MAX;
      n.armies[from] = { nation: mover.nation, count: rest, morale: Math.min(mover.morale, rest), moved: true };
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
  const { morale, towns, plain, ports } = standing(s, nation),
    share = towns ? Math.floor((plain + 5 * ports) / towns) : 0,
    spawned: number[] = [];
  const add = (h: number, men: number) => {
    const a = s.armies[h];
    if (a && a.nation !== nation) return;
    if (a) a.count = Math.min(MAX, a.count + men);
    else s.armies[h] = { nation, count: Math.min(MAX, men), morale: Math.min(morale, men), moved: false };
    cap(s.armies[h]!);
    spawned.push(h);
  };
  for (let h = 0; h < HEXES; h++) if (s.owner[h] === nation && s.map.estate[h] === CAPITAL) add(h, CAPITAL_MEN);
  for (let h = 0; h < HEXES; h++) if (s.owner[h] === nation && s.map.estate[h] === TOWN) add(h, TOWN_MEN + share);
  return spawned;
}
/** The turn of the nation to move ends, and the next nation that can move begins its own. Changes `s`. */
function passOn(s: State, last: Last) {
  for (let guard = 0; guard < 12 && s.winner === null; guard++) {
    const nation = s.seat;
    for (const a of s.armies)
      if (a && a.nation === nation) {
        if (!a.moved) a.morale = Math.max(0, a.morale - 1);
        a.moved = false;
      }
    last.spawned.push(...reinforce(s, nation));
    last.ended.push(nation);
    floors(s);
    // The next nation still in the game, a new round when it comes back round to me.
    let next = nation;
    do {
      next = (next + 1) % NATIONS;
      if (next === 0) s.round++;
    } while (!(s.nations[next].present && s.nations[next].alive));
    s.seat = next;
    if (s.round > LIMIT) {
      s.winner = "draw";
      return;
    }
    s.budget = Math.min(MOVES, standing(s, next).armies);
    s.left = s.budget;
    if (s.left > 0 && movable(s, next).length) return;
  }
}
/** A new game with `computers` computers (1–3), its map drawn from `random`. */
export function createGame(computers = 3, random: Random = cryptoRandom): State {
  const map = generateMap(seeded(random())),
    seats = SEATS[Math.min(3, Math.max(1, Math.round(computers)))],
    owner = new Array<number>(HEXES).fill(-1),
    armies: (Army | null)[] = new Array(HEXES).fill(null);
  const nations: Nation[] = map.corners.map((capital, i) => ({ present: seats.includes(i), alive: seats.includes(i), capital: seats.includes(i) ? capital : -1 }));
  // An unused corner is plain land: no capital there.
  const estate = map.estate.map((e, h) => (e === CAPITAL && !nations.some((n) => n.capital === h) ? NONE : e));
  const laid = { ...map, estate };
  for (const i of seats) {
    const c = map.corners[i];
    owner[c] = i;
    armies[c] = { nation: i, ...START, moved: false };
    for (const n of NEIGHBOURS[c]) if (laid.land[n] && laid.estate[n] === NONE) owner[n] = i;
  }
  return { map: laid, owner, armies, nations, seat: 0, left: 1, budget: 1, round: 1, ply: 0, winner: null, last: null };
}
export const create = (_variant: string, options: GameOptions = {}) => createGame(Number(options.computers) || 3);
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  const out: Move[] = [];
  for (const h of movable(s)) for (const d of destinations(s, h)) out.push({ from: h, to: d.to, extra: -1 });
  out.push({ from: -1, to: END, extra: -1 });
  return out;
}
export function play(s: State, move: Move): State | null {
  if (s.winner !== null) return null;
  let next: State;
  if (move.from === -1 && move.to === END) {
    next = clone(s);
    next.last = blank(s.seat, "end");
    passOn(next, next.last);
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
  play: (s, m) => play(s, m),
  turn: (s) => (s.seat === 0 ? 0 : 1),
  winner: (s) => s.winner,
  owners: (s) => s.owner.map((o) => (o < 0 ? null : o === 0 ? 0 : 1)),
  effect: () => null,
  ply: (s) => s.ply,
  evaluate: (s, player) => {
    const mine = standing(s, 0),
      theirs = [1, 2, 3].map((n) => standing(s, n)).reduce((a, b) => a + b.men + b.land, 0);
    const v = mine.men + mine.land - theirs / 3;
    return player === 0 ? v : -v;
  },
  hint: (s) => `남은 이동 ${s.left}/${s.budget} · 움직일 군대를 고르세요.`,
  tally: (s) => {
    const me = standing(s, 0);
    const others = [1, 2, 3].filter((n) => s.nations[n].present).map((n) => (s.nations[n].alive ? `${nameOf(n)} ${standing(s, n).men}` : `${nameOf(n)} 멸망`));
    return [`병력 ${me.men} · 사기 ${me.morale} · 도시 ${me.towns}`, others.join(" · ")];
  },
  reason: (s) => {
    if (s.winner === 0) return "모든 나라를 정복했습니다. 세계가 홍국의 깃발 아래 하나가 되었습니다.";
    if (s.winner === "draw") return `${LIMIT}턴이 지나 비겼습니다. 끝내 승부가 나지 않았습니다.`;
    const by = s.last && s.last.conquered === 0 ? s.last.nation : -1;
    return by > 0 ? `${nameOf(by)}이 홍국의 수도를 점령했습니다. 나라가 무너졌습니다.` : "홍국의 수도가 함락되었습니다.";
  },
};
