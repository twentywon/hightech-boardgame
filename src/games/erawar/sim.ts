/**
 * 시대 전쟁: one lane between two bases, played in real time, free of Three.js and the page (the tests play it).
 *
 * Each side trains soldiers at its base with gold (a queue of five, one trained at a time); they walk along the lane
 * toward the other base and fight what they meet: a soldier stops behind a friend ahead of it, and at an enemy (or the
 * enemy's base) within its reach it strikes or shoots. Ranged soldiers shoot over the friends in front of them. A
 * soldier killed gives the side that killed it gold and experience (and its own side a little experience, learnt from
 * the loss); a trickle of gold comes to each base besides, so that neither can be left with nothing. Experience opens
 * the next era (석기 → 중세 → 화약 → 현대, the user asked for no era after the modern one): stronger soldiers, a
 * stronger base, a new turret and a new special attack. Up to three turrets stand on a base and shoot what comes near;
 * a turret is sold back for half. The special attack, once it is ready, lets rocks, arrows, shells or bombs fall slowly
 * over the whole lane, each striking only the one enemy soldier it lands on (no splash). Soldiers take seconds to train
 * and walk slowly (the user asked for both). A base brought to nothing loses the match.
 * There is no time limit (the user asked for it gone). So that no match stands still for ever, the last era has two
 * things more: its gold, which piles up faster than soldiers can be trained, buys ranks (강화), each making the soldiers
 * trained afterwards (and the special attack) stronger, so that the side winning its fights (whose kills pay) grows
 * stronger still; and its soldiers fight with momentum (기세), harder the further past the middle they have pushed.
 *
 * x runs along the lane: side 0's base at the left (−), side 1's at the right (+). Everything is reckoned in fixed
 * steps (`DT`); the random draws (where the special attack falls, the computer's whims) come from the world's own
 * seeded stream, so that one seed plays one match.
 */
export const DT = 1 / 30;
/** Seconds of play a world has run. */
export const seconds = (world: World) => world.tick * DT;
/** Where each base stands (its middle) and where its front is (what is struck, and where soldiers come out). */
export const BASE_X = 15.2,
  FRONT = 13.2,
  SPAWN = 12.6;
/** Soldiers on the lane per side at most, the queue's length, the turret slots. */
export const ARMY = 14,
  QUEUE = 5,
  SLOTS = 3;
/** How far a soldier keeps behind a friend ahead, and how near it may come to an enemy. */
export const GAP = 0.78,
  CONTACT = 0.62;
/** What a killing earns (by the dead soldier's price), what the side that lost it learns, a turret sold back. */
export const KILL_GOLD = 0.9,
  KILL_XP = 1.6,
  LOSS_XP = 0.4,
  SELL_BACK = 0.5;
/** The special attack's wait between uses, and its first wait. */
export const ABILITY_COOL = 50,
  ABILITY_FIRST = 25;
/**
 * How the special attack falls (the user asked: over the whole lane, slowly, each piece striking one soldier only): the
 * seconds a piece takes from the sky to the ground, how long the whole volley takes to set off, and how far beside a
 * soldier's middle a piece still strikes it (its half-room and this).
 */
export const FALL_TIME = 2.6,
  VOLLEY = 4.5,
  FALL_PAD = 0.12;
export const START_GOLD = 175;
/**
 * Momentum (기세), in the last era: a soldier past the lane's middle strikes harder the further it has pushed (up to
 * this share more at the enemy's front), so that two even sides do not stand for ever in the middle of the lane.
 */
export const MOMENTUM = 2.2;
/** How much harder a soldier strikes where it stands (its era's momentum). */
export const momentum = (u: { side: number; era: number; x: number }) => (u.era >= LAST_ERA ? 1 + MOMENTUM * Math.max(0, Math.min(1, ahead(u.side, u.x) / FRONT)) : 1);

export type Kind = 0 | 1 | 2;
export type ShotKind = "rock" | "arrow" | "bullet" | "ball" | "shell" | "fallRock" | "fallArrow" | "fallShell" | "bomb";
export const SHOT_KINDS: ShotKind[] = ["rock", "arrow", "bullet", "ball", "shell", "fallRock", "fallArrow", "fallShell", "bomb"];
export interface UnitType {
  name: string;
  cost: number;
  hp: number;
  dmg: number;
  /** Reach (m), seconds between blows, speed (m/s), seconds to train; a ranged soldier's shot and its splash. */
  range: number;
  cool: number;
  speed: number;
  train: number;
  shot?: ShotKind;
  splash?: number;
  /** Its room on the lane (a rider or a gun takes more). */
  size: number;
}
export interface EraType {
  name: string;
  /** The base's strength in this era. */
  base: number;
  /** Gold trickling in each second. */
  trickle: number;
  units: [UnitType, UnitType, UnitType];
  turret: { name: string; cost: number; dmg: number; range: number; cool: number; shot: ShotKind; splash?: number };
  /** The special attack: how many fall (spread over the whole lane), and what each does to the one soldier it strikes. */
  ability: { name: string; count: number; dmg: number; shot: ShotKind };
}
export const ERAS: EraType[] = [
  {
    name: "석기",
    base: 600,
    trickle: 2,
    units: [
      { name: "몽둥이 전사", cost: 15, hp: 60, dmg: 14, range: 0.8, cool: 1, speed: 0.6, train: 2.5, size: 0.8 },
      { name: "투석꾼", cost: 25, hp: 42, dmg: 9, range: 3.6, cool: 1.3, speed: 0.6, train: 3, shot: "rock", size: 0.8 },
      { name: "매머드 기수", cost: 110, hp: 330, dmg: 34, range: 1.1, cool: 1.5, speed: 0.48, train: 7.5, size: 1.6 },
    ],
    turret: { name: "돌팔매 탑", cost: 150, dmg: 10, range: 6, cool: 1.6, shot: "rock" },
    ability: { name: "낙석", count: 26, dmg: 60, shot: "fallRock" },
  },
  {
    name: "중세",
    base: 1200,
    trickle: 4,
    units: [
      { name: "검사", cost: 45, hp: 165, dmg: 30, range: 0.85, cool: 1, speed: 0.6, train: 3, size: 0.8 },
      { name: "장궁수", cost: 70, hp: 100, dmg: 20, range: 4, cool: 1.3, speed: 0.6, train: 3.5, shot: "arrow", size: 0.8 },
      { name: "기사", cost: 320, hp: 820, dmg: 70, range: 1.2, cool: 1.4, speed: 0.69, train: 8, size: 1.6 },
    ],
    turret: { name: "쇠뇌 탑", cost: 450, dmg: 28, range: 6.2, cool: 1.6, shot: "arrow" },
    ability: { name: "화살비", count: 28, dmg: 70, shot: "fallArrow" },
  },
  {
    name: "화약",
    base: 2400,
    trickle: 9,
    units: [
      { name: "총검병", cost: 140, hp: 410, dmg: 62, range: 0.9, cool: 1, speed: 0.6, train: 3.5, size: 0.8 },
      { name: "머스킷 사수", cost: 200, hp: 250, dmg: 48, range: 4.4, cool: 1.6, speed: 0.57, train: 4, shot: "bullet", size: 0.8 },
      { name: "야포", cost: 900, hp: 1400, dmg: 150, range: 4.2, cool: 2.2, speed: 0.36, train: 10, shot: "ball", splash: 0.9, size: 1.7 },
    ],
    turret: { name: "요새포", cost: 1300, dmg: 70, range: 6.4, cool: 2.4, shot: "ball", splash: 0.6 },
    ability: { name: "일제 포격", count: 22, dmg: 420, shot: "fallShell" },
  },
  {
    name: "현대",
    base: 5000,
    trickle: 20,
    units: [
      { name: "돌격병", cost: 420, hp: 920, dmg: 120, range: 0.9, cool: 0.9, speed: 0.63, train: 4, size: 0.8 },
      { name: "기관총 사수", cost: 600, hp: 600, dmg: 34, range: 4.8, cool: 0.35, speed: 0.57, train: 4.5, shot: "bullet", size: 0.8 },
      { name: "전차", cost: 2400, hp: 3600, dmg: 300, range: 4, cool: 2, speed: 0.42, train: 11.25, shot: "shell", splash: 1, size: 2 },
    ],
    turret: { name: "기관포", cost: 3500, dmg: 26, range: 6.6, cool: 0.4, shot: "bullet" },
    ability: { name: "공습", count: 22, dmg: 1100, shot: "bomb" },
  },
];
/** The experience that opens the next era (from era k to k + 1). */
export const XP_NEXT = [1100, 5200, 22000];
export const LAST_ERA = ERAS.length - 1;
/**
 * The ranks of the last era (강화), bought with gold: the first's price and how much more each further one costs, and
 * how much stronger (life and blows) each makes the soldiers trained after it and the special attack.
 */
export const RANK_GOLD = 1500,
  RANK_MORE = 100,
  RANK_BOOST = 0.15;
/** The gold rank `r + 1` costs. */
export const rankCost = (r: number) => RANK_GOLD + RANK_MORE * r;
/** How much stronger a soldier of a rank is. */
export const powerOf = (rank: number) => 1 + RANK_BOOST * rank;

export interface Unit {
  id: number;
  side: 0 | 1;
  era: number;
  kind: Kind;
  /** Its side's rank (강화) when it was trained: its life and blows are `powerOf(rank)` times its kind's. */
  rank: number;
  x: number;
  hp: number;
  max: number;
  /** Seconds to its next blow, and since its last (drawn as the swing or the shot). */
  cool: number;
  since: number;
  /** Whether it walked in the last step. */
  walking: boolean;
}
export interface Shot {
  id: number;
  side: 0 | 1;
  kind: ShotKind;
  /** Where it set out and where it is; a shot at a soldier follows it (`target`), one at a base flies to its front. */
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** The soldier aimed at (−1: the base; −2: falling from the sky onto the ground at `tx`). */
  target: number;
  tx: number;
  ty: number;
  t: number;
  time: number;
  arc: number;
  dmg: number;
  splash: number;
  /** A falling shot waits this long before it starts to fall. */
  wait: number;
}
export interface Turret {
  era: number;
  cool: number;
  since: number;
}
export interface Army {
  gold: number;
  xp: number;
  era: number;
  hp: number;
  max: number;
  /** The ranks bought in the last era (강화). */
  rank: number;
  /** What is being trained, in order (each with the era it was ordered in), and how far the first one is along (s). */
  queue: { era: number; kind: Kind }[];
  training: number;
  turrets: (Turret | null)[];
  /** Seconds before the special attack is ready again. */
  ability: number;
  /** What its gold is multiplied by (the computer's level: an easy computer earns less, a hard one more). */
  bonus: number;
  /** Soldiers trained and lost, kills made (for the tests and the result). */
  trained: number;
  lost: number;
  kills: number;
}
/** What happened in a step, for the screen (sounds, words, sparks) and for the devices that only watch. */
export type EventCode = "die" | "melee" | "shoot" | "impact" | "base" | "ability" | "era" | "turret" | "sell" | "spawn" | "fall" | "rank";
export const EVENT_CODES: EventCode[] = ["die", "melee", "shoot", "impact", "base", "ability", "era", "turret", "sell", "spawn", "fall", "rank"];
export interface Happening {
  seq: number;
  code: EventCode;
  x: number;
  side: 0 | 1;
  /** What it was of: a soldier's era·kind (era × 3 + kind), a shot's kind's number, an era, a slot. */
  extra: number;
}
export interface World {
  tick: number;
  armies: [Army, Army];
  units: Unit[];
  shots: Shot[];
  nextId: number;
  seed: number;
  /** The happenings of the last steps (kept for a while, so that devices that only watch hear them too). */
  events: Happening[];
  seq: number;
  over: boolean;
  /** Who won (null: not yet). */
  winner: 0 | 1 | null;
}
export type Command = { kind: "train"; unit: Kind } | { kind: "turret"; slot: number } | { kind: "sell"; slot: number } | { kind: "ability" } | { kind: "era" };

const army = (): Army => ({
  gold: START_GOLD,
  xp: 0,
  era: 0,
  rank: 0,
  hp: ERAS[0].base,
  max: ERAS[0].base,
  queue: [],
  training: 0,
  turrets: Array.from({ length: SLOTS }, () => null),
  ability: ABILITY_FIRST,
  bonus: 1,
  trained: 0,
  lost: 0,
  kills: 0,
});
export function createWorld(seed = 1): World {
  return { tick: 0, armies: [army(), army()], units: [], shots: [], nextId: 1, seed: seed >>> 0 || 1, events: [], seq: 0, over: false, winner: null };
}
/** The world's own random stream (mulberry32). */
export function rand(world: World) {
  let t = (world.seed = (world.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Which way a side's soldiers go (+1 for side 0, rightward). */
export const way = (side: number) => (side === 0 ? 1 : -1);
export const baseX = (side: number) => (side === 0 ? -BASE_X : BASE_X);
export const frontOf = (side: number) => (side === 0 ? -FRONT : FRONT);
export const spawnOf = (side: number) => (side === 0 ? -SPAWN : SPAWN);
export const typeOf = (u: { era: number; kind: number }) => ERAS[u.era].units[u.kind];
/** How far along the lane toward the enemy a place is, for a side. */
const ahead = (side: number, x: number) => x * way(side);
/** The xp (all told) the next era needs for a side, or null in the last era. */
export function nextEra(world: World, side: number) {
  const era = world.armies[side].era;
  return era >= LAST_ERA ? null : XP_NEXT[era];
}
/** Whether a side may open its next era, or in the last era buy its next rank (강화). */
export const canEra = (world: World, side: number) => {
  const a = world.armies[side],
    need = nextEra(world, side);
  return !world.over && (need === null ? a.gold >= rankCost(a.rank) : a.xp >= need);
};
export const turretCost = (era: number) => ERAS[era].turret.cost;
/** Whether a side may order that (gold, room in the queue, an empty slot, the special attack ready…). */
export function allowed(world: World, side: number, c: Command): boolean {
  if (world.over) return false;
  const a = world.armies[side];
  switch (c.kind) {
    case "train":
      return a.queue.length < QUEUE && a.gold >= ERAS[a.era].units[c.unit].cost;
    case "turret":
      return c.slot >= 0 && c.slot < SLOTS && !a.turrets[c.slot] && a.gold >= turretCost(a.era);
    case "sell":
      return c.slot >= 0 && c.slot < SLOTS && !!a.turrets[c.slot];
    case "ability":
      return a.ability <= 0;
    case "era":
      return canEra(world, side);
  }
}
function emit(world: World, code: EventCode, x: number, side: 0 | 1, extra = 0) {
  world.events.push({ seq: ++world.seq, code, x, side, extra });
  if (world.events.length > 64) world.events.splice(0, world.events.length - 64);
}
/** Carries out an order for a side, if it may be (true when it was). */
export function command(world: World, side: 0 | 1, c: Command): boolean {
  if (!allowed(world, side, c)) return false;
  const a = world.armies[side];
  switch (c.kind) {
    case "train":
      a.gold -= ERAS[a.era].units[c.unit].cost;
      a.queue.push({ era: a.era, kind: c.unit });
      return true;
    case "turret":
      a.gold -= turretCost(a.era);
      a.turrets[c.slot] = { era: a.era, cool: 0.6, since: 9 };
      emit(world, "turret", baseX(side), side, c.slot);
      return true;
    case "sell": {
      const t = a.turrets[c.slot]!;
      a.gold += Math.round(turretCost(t.era) * SELL_BACK);
      a.turrets[c.slot] = null;
      emit(world, "sell", baseX(side), side, c.slot);
      return true;
    }
    case "ability": {
      a.ability = ABILITY_COOL;
      const ab = ERAS[a.era].ability,
        reach = FRONT - 0.5,
        // Over the whole lane, base to base: each piece in its own stretch of it, set off in a shuffled order (the
        // bombers' from the own base onward, under the planes as they cross).
        spots = Array.from({ length: ab.count }, (_, k) => -reach + (2 * reach * (k + rand(world))) / ab.count);
      if (ab.shot === "bomb") spots.sort((p, q) => ahead(side, p) - ahead(side, q));
      else
        for (let k = spots.length - 1; k > 0; k--) {
          const j = Math.floor(rand(world) * (k + 1));
          [spots[k], spots[j]] = [spots[j], spots[k]];
        }
      for (const [k, tx] of spots.entries())
        world.shots.push({ id: world.nextId++, side, kind: ab.shot, x0: tx - way(side) * 1.5, y0: 13, x: tx - way(side) * 1.5, y: 13, target: -2, tx, ty: 0, t: 0, time: FALL_TIME, arc: 0, dmg: ab.dmg * powerOf(a.rank), splash: 0, wait: (k / ab.count) * VOLLEY + (ab.shot === "bomb" ? 0 : rand(world) * 0.2) });
      emit(world, "ability", 0, side, a.era);
      return true;
    }
    case "era": {
      // In the last era, a rank: the soldiers trained from now on are stronger.
      if (a.era >= LAST_ERA) {
        a.gold -= rankCost(a.rank);
        a.rank++;
        emit(world, "rank", baseX(side), side, a.rank);
        return true;
      }
      const before = a.max;
      a.era++;
      a.max = ERAS[a.era].base;
      a.hp += a.max - before;
      emit(world, "era", baseX(side), side, a.era);
      return true;
    }
  }
}
/** Where a turret in a slot shoots from. */
export const turretAt = (side: number, slot: number) => ({ x: baseX(side) + way(side) * (0.2 + slot * 0.35), y: 3.1 + slot * 0.95 });
/** The height a soldier's shot leaves from and is aimed at. */
const HAND = 1.05;
function fire(world: World, side: 0 | 1, from: { x: number; y: number }, kind: ShotKind, dmg: number, splash: number, target: Unit | null) {
  const tx = target ? target.x : frontOf(1 - side),
    ty = target ? 0.9 : 1.6,
    far = Math.abs(tx - from.x),
    speed = kind === "bullet" ? 26 : kind === "arrow" ? 11 : kind === "rock" ? 8 : 9,
    arc = kind === "bullet" ? 0 : kind === "arrow" ? far * 0.22 : far * 0.3;
  world.shots.push({ id: world.nextId++, side, kind, x0: from.x, y0: from.y, x: from.x, y: from.y, target: target ? target.id : -1, tx, ty, t: 0, time: Math.max(0.08, far / speed), arc, dmg, splash, wait: 0 });
  emit(world, "shoot", from.x, side, SHOT_KINDS.indexOf(kind));
}
function hurt(world: World, u: Unit, dmg: number, by: 0 | 1) {
  if (u.hp <= 0) return;
  u.hp -= dmg;
  if (u.hp <= 0) {
    const t = typeOf(u),
      mine = world.armies[u.side],
      theirs = world.armies[by];
    theirs.gold += Math.round(t.cost * KILL_GOLD * theirs.bonus);
    theirs.xp += Math.round(t.cost * KILL_XP);
    theirs.kills++;
    mine.xp += Math.round(t.cost * LOSS_XP);
    mine.lost++;
    emit(world, "die", u.x, u.side, u.era * 3 + u.kind);
  }
}
function hitBase(world: World, side: 0 | 1, dmg: number) {
  const a = world.armies[side];
  if (world.over) return;
  a.hp = Math.max(0, a.hp - dmg);
  emit(world, "base", frontOf(side), side, 0);
  if (a.hp <= 0) {
    world.over = true;
    world.winner = (1 - side) as 0 | 1;
    emit(world, "fall", baseX(side), side, a.era);
  }
}
/** A shot landing at x for a side: on its target, or on every enemy soldier within its splash; a piece of the special attack on the one enemy it falls on, if any. */
function land(world: World, s: Shot) {
  const foe = (1 - s.side) as 0 | 1;
  if (s.target === -2) {
    let struck: Unit | null = null;
    for (const u of world.units) {
      const off = Math.abs(u.x - s.x);
      if (u.side === foe && u.hp > 0 && off <= typeOf(u).size / 2 + FALL_PAD && (!struck || off < Math.abs(struck.x - s.x))) struck = u;
    }
    if (struck) hurt(world, struck, s.dmg, s.side);
  } else if (s.splash > 0) {
    for (const u of world.units) if (u.side === foe && u.hp > 0 && Math.abs(u.x - s.x) <= s.splash) hurt(world, u, s.dmg, s.side);
    if (s.target === -1) hitBase(world, foe, s.dmg);
  } else if (s.target === -1) hitBase(world, foe, s.dmg);
  else {
    const u = world.units.find((v) => v.id === s.target);
    if (u && u.hp > 0) hurt(world, u, s.dmg, s.side);
  }
  emit(world, "impact", s.x, s.side, SHOT_KINDS.indexOf(s.kind));
}
/** The enemy nearest ahead of a soldier (the foremost of the other side), or null. */
function foremost(world: World, side: 0 | 1) {
  let best: Unit | null = null;
  for (const u of world.units) if (u.side === side && u.hp > 0 && (!best || ahead(side, u.x) > ahead(side, best.x))) best = u;
  return best;
}
/** One step of the lane: training, walking and fighting, the turrets, the shots in the air, the dead taken off. */
export function step(world: World, orders: [Command[], Command[]] = [[], []]): Happening[] {
  const from = world.seq;
  if (world.over) return [];
  world.tick++;
  for (const side of [0, 1] as const) for (const c of orders[side]) command(world, side, c);
  for (const side of [0, 1] as const) {
    const a = world.armies[side];
    a.gold += ERAS[a.era].trickle * a.bonus * DT;
    if (a.ability > 0) a.ability = Math.max(0, a.ability - DT);
    // Training: the first in the queue, then out at the base's door when there is room there.
    const head = a.queue[0];
    if (head) {
      const t = ERAS[head.era].units[head.kind];
      a.training = Math.min(t.train, a.training + DT);
      const mine = world.units.filter((u) => u.side === side),
        door = spawnOf(side),
        clear = !mine.some((u) => Math.abs(u.x - door) < (typeOf(u).size + t.size) / 2 + 0.05);
      if (a.training >= t.train && clear && mine.length < ARMY) {
        a.queue.shift();
        a.training = 0;
        a.trained++;
        const hp = Math.round(t.hp * powerOf(a.rank));
        world.units.push({ id: world.nextId++, side, era: head.era, kind: head.kind, rank: a.rank, x: door, hp, max: hp, cool: 0.3, since: 9, walking: false });
        emit(world, "spawn", door, side, head.era * 3 + head.kind);
      }
    } else a.training = 0;
  }
  // The soldiers, the foremost of each side first: each stops behind the friend ahead of it and at an enemy within reach.
  // (The two sides take turns at going first, step by step, so that neither always strikes first.)
  const order: (0 | 1)[] = world.tick % 2 ? [0, 1] : [1, 0];
  for (const side of order) {
    const foe = (1 - side) as 0 | 1,
      dir = way(side),
      mine = world.units.filter((u) => u.side === side && u.hp > 0).sort((p, q) => ahead(side, q.x) - ahead(side, p.x)),
      wall = frontOf(foe);
    let enemy = foremost(world, foe);
    let before: Unit | null = null;
    for (const u of mine) {
      const t = typeOf(u);
      u.since = Math.min(9, u.since + DT);
      u.cool = Math.max(0, u.cool - DT);
      // What it would strike: the foremost enemy, or the base when the lane ahead is clear (or the base is nearer).
      const toEnemy = enemy ? ahead(side, enemy.x) - ahead(side, u.x) : Infinity,
        toWall = ahead(side, wall) - ahead(side, u.x),
        reachEnemy = enemy !== null && toEnemy <= t.range + (typeOf(enemy).size - 0.8) / 2,
        reachWall = toWall <= t.range + 0.05;
      u.walking = false;
      if (reachEnemy || reachWall) {
        if (u.cool <= 0) {
          u.cool = t.cool;
          u.since = 0;
          const target = reachEnemy ? enemy : null;
          const dmg = t.dmg * powerOf(u.rank) * momentum(u);
          if (t.shot) fire(world, side, { x: u.x + dir * 0.3, y: HAND + (t.size > 1.2 ? 0.2 : 0) }, t.shot, dmg, t.splash ?? 0, target);
          else if (target) {
            hurt(world, target, dmg, side);
            emit(world, "melee", (u.x + target.x) / 2, side, u.era);
          } else {
            hitBase(world, foe, dmg);
            emit(world, "melee", wall, side, u.era);
          }
        }
      }
      // A ranged soldier behind a friend still closes up behind it while it shoots (the foremost one stands off).
      if ((!reachEnemy && !reachWall) || (t.shot && before)) {
        let limit = ahead(side, wall) - 0.05;
        if (enemy) limit = Math.min(limit, ahead(side, enemy.x) - CONTACT - (t.size + typeOf(enemy).size - 1.6) / 2);
        if (before) limit = Math.min(limit, ahead(side, before.x) - GAP - (t.size + typeOf(before).size - 1.6) / 2);
        const now = ahead(side, u.x),
          next = Math.min(limit, now + t.speed * DT);
        if (next > now + 1e-6) {
          u.x = next * dir;
          u.walking = true;
        }
      }
      before = u;
      if (enemy && enemy.hp <= 0) enemy = foremost(world, foe);
    }
  }
  // The turrets shoot at the nearest enemy within reach of the base's front.
  for (const side of order) {
    const a = world.armies[side],
      foe = (1 - side) as 0 | 1;
    a.turrets.forEach((tur, slot) => {
      if (!tur) return;
      tur.cool = Math.max(0, tur.cool - DT);
      tur.since = Math.min(9, tur.since + DT);
      const type = ERAS[tur.era].turret;
      let target: Unit | null = null;
      for (const u of world.units)
        if (u.side === foe && u.hp > 0) {
          const d = Math.abs(u.x - frontOf(side));
          if (d <= type.range && (!target || d < Math.abs(target.x - frontOf(side)))) target = u;
        }
      if (target && tur.cool <= 0) {
        tur.cool = type.cool;
        tur.since = 0;
        fire(world, side, turretAt(side, slot), type.shot, type.dmg, type.splash ?? 0, target);
      }
    });
  }
  // The shots in the air: each to its target (followed), and on arriving it lands.
  for (const s of world.shots) {
    if (s.wait > 0) {
      s.wait -= DT;
      continue;
    }
    if (s.target >= 0) {
      const u = world.units.find((v) => v.id === s.target);
      if (u && u.hp > 0) s.tx = u.x;
    }
    s.t = Math.min(s.time, s.t + DT);
    const p = s.t / s.time;
    s.x = s.x0 + (s.tx - s.x0) * p;
    s.y = s.y0 + (s.ty - s.y0) * p + s.arc * 4 * p * (1 - p);
    if (p >= 1) land(world, s);
  }
  world.shots = world.shots.filter((s) => s.t < s.time);
  world.units = world.units.filter((u) => u.hp > 0);
  return world.events.filter((e) => e.seq > from);
}

// ── The computer ──
export type Level = "easy" | "normal" | "hard";
/**
 * How the computer plays at each level: how often it thinks (s), how much it keeps in its queue, how its soldiers are
 * chosen (`mix`: a sensible line of fighters with shooters behind and a big one when it can, or whims), when it builds
 * turrets (gold over their price × `turretAt`), how many enemies the special attack waits for, how long it puts off a
 * new era once it may, and how often it lets a moment pass doing nothing; `income` is what its gold is multiplied by
 * (set on its army when the match begins, `computerSide`).
 */
export const LEVELS: Record<Level, { income: number; think: number; queue: number; mix: "smart" | "rough" | "whim"; turretAt: number; abilityAt: number; eraDelay: number; idle: number; renew: boolean; rankAt: number }> = {
  easy: { income: 0.8, think: 1.6, queue: 2, mix: "whim", turretAt: 3.5, abilityAt: 1, eraDelay: 35, idle: 0.45, renew: false, rankAt: 4 },
  normal: { income: 1, think: 0.8, queue: 3, mix: "rough", turretAt: 2, abilityAt: 3, eraDelay: 6, idle: 0.12, renew: false, rankAt: 2.5 },
  hard: { income: 1.2, think: 0.4, queue: 4, mix: "smart", turretAt: 1.4, abilityAt: 3, eraDelay: 0, idle: 0, renew: true, rankAt: 1.5 },
};
export interface Mind {
  wait: number;
  /** Seconds since a new era could be opened. */
  could: number;
}
/** Makes a side the computer's at a level (its gold as the level earns it). */
export function computerSide(world: World, side: 0 | 1, level: Level) {
  world.armies[side].bonus = LEVELS[level].income;
}
export const freshMind = (): Mind => ({ wait: 1, could: 0 });
/** The orders the computer gives for a side this step (most steps none: it thinks every `think` seconds). */
export function think(world: World, side: 0 | 1, level: Level, mind: Mind): Command[] {
  const L = LEVELS[level],
    a = world.armies[side],
    foe = (1 - side) as 0 | 1,
    out: Command[] = [];
  mind.could = canEra(world, side) ? mind.could + DT : 0;
  mind.wait -= DT;
  if (mind.wait > 0 || world.over) return out;
  mind.wait = L.think * (0.75 + rand(world) * 0.5);
  if (rand(world) < L.idle) return out;
  const eraUnits = ERAS[a.era].units,
    mine = world.units.filter((u) => u.side === side),
    theirs = world.units.filter((u) => u.side === foe),
    worth = (list: Unit[]) => list.reduce((n, u) => n + typeOf(u).cost * (u.era + 1) * (u.hp / u.max), 0);
  if (a.era < LAST_ERA && canEra(world, side) && mind.could >= L.eraDelay) out.push({ kind: "era" });
  // The special attack (it falls over the whole lane): on enough enemies (or, the easy computer, on anything), or on any near its base.
  if (a.ability <= 0 && theirs.length) {
    const crowd = theirs.length,
      near = theirs.some((u) => Math.abs(u.x - frontOf(side)) < 5);
    if (crowd >= L.abilityAt || (near && L.mix !== "whim")) out.push({ kind: "ability" });
  }
  // Soldiers: kept coming while the queue has room.
  let gold = a.gold;
  const queued = a.queue.length;
  if (queued < L.queue) {
    const afford = ([0, 1, 2] as Kind[]).filter((k) => eraUnits[k].cost <= gold);
    let pick: Kind | null = null;
    if (afford.length) {
      if (L.mix === "whim") pick = rand(world) < 0.6 ? afford[Math.floor(rand(world) * afford.length)] : null;
      else {
        const fighters = mine.filter((u) => u.kind !== 1).length + a.queue.filter((q) => q.kind !== 1).length,
          shooters = mine.filter((u) => u.kind === 1).length + a.queue.filter((q) => q.kind === 1).length,
          behind = worth(theirs) > worth(mine) * 1.2,
          bigFoe = theirs.some((u) => u.kind === 2 && u.era >= a.era);
        if (L.mix === "smart") {
          const crowded = mine.length + a.queue.length >= ARMY - 2,
            // Big ones jam the lane behind one another (only the foremost can fight): a few at a time, a line in front.
            bigs = mine.filter((u) => u.kind === 2).length + a.queue.filter((q) => q.kind === 2).length,
            room = bigs < 2 || (bigs < 3 && fighters > bigs * 2);
          if (afford.includes(2) && room && (bigFoe || behind || crowded || gold > eraUnits[2].cost * 1.6)) pick = 2;
          // Near the lane's limit it saves for the big one rather than send another small one.
          else if (crowded && eraUnits[2].cost < a.gold * 3) pick = null;
          else if (shooters * 2 < fighters && afford.includes(1)) pick = 1;
          else pick = afford.includes(0) ? 0 : afford[0];
        } else {
          const r = rand(world);
          pick = r < 0.15 && afford.includes(2) ? 2 : r < 0.5 && afford.includes(1) ? 1 : afford.includes(0) ? 0 : afford[0];
        }
      }
    }
    if (pick !== null) {
      out.push({ kind: "train", unit: pick });
      gold -= eraUnits[pick].cost;
    }
  }
  // In the last era, a rank (강화) with the gold the soldiers leave over: the queue kept full (more gold than one
  // soldier can be trained with), or plenty of it.
  const price = rankCost(a.rank);
  if (a.era >= LAST_ERA && gold >= price && ((L.renew && a.queue.length >= L.queue - 1) || gold >= price * L.rankAt)) {
    out.push({ kind: "era" });
    gold -= price;
  }
  // Turrets: with gold to spare; the hard computer also replaces one of an older era.
  const cost = turretCost(a.era),
    empty = a.turrets.findIndex((t) => !t);
  if (empty >= 0 && gold >= cost * L.turretAt && (L.mix !== "whim" || rand(world) < 0.3)) out.push({ kind: "turret", slot: empty });
  else if (L.renew && empty < 0 && gold >= cost * 2) {
    const old = a.turrets.findIndex((t) => t && t.era < a.era);
    if (old >= 0) out.push({ kind: "sell", slot: old }, { kind: "turret", slot: old });
  }
  return out;
}

