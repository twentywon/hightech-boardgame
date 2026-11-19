/**
 * 전술 대전: two small armies of six on a field of tiles of different heights. Units act one at a time, in an order
 * set by their speed (a charge that grows by the speed each tick; at 100 the unit acts). A unit may move and attack
 * (a healer heals instead), in either order, and then its turn ends; one that only waits comes back sooner. Damage is
 * attack less defence, more from higher ground or from behind. When a healer is the last of her side she turns into
 * the angel: her attack kills any unit within eight squares at once, but any hit kills her.
 *
 * A command is a move of the shared point-game screen. What the player taps depends on what is being chosen (`aim`):
 * the commands (이동, 공격, 대기, 되돌리기), then a tile to move to or a target, tapped once to see what it hits and
 * again to strike. Choosing what to do does not count as a move; moving, striking, waiting and taking a move back do.
 * The computer plays the same commands directly (`from` the unit's tile, `extra` STEP or STRIKE).
 */
import type { Move, PointGame, Winner } from "../points/types";

export const W = 10,
  D = 10,
  CELLS = W * D;
/** After this many turns of units the battle is drawn. */
export const LIMIT = 300;
/** The commands, as points off the field (a tap on a tile is the tile's own number). */
export const AIM_MOVE = 1000,
  AIM_ACT = 1001,
  CANCEL = 1002,
  WAIT = 1003,
  UNDO = 1004;
/** What a direct move does (its `extra`): walk to `to`, or strike at `to`. */
export const STEP = 1,
  STRIKE = 2;
/** What one heal gives back. */
export const HEAL = 14;
/** How far the angel's attack reaches (squares counted along the grid, any direction). */
export const ANGEL_RANGE = 8;

export type Ground = "grass" | "stone" | "dirt" | "water" | "rock" | "tree" | "bridge";
export type Job = "knight" | "archer" | "fire" | "healer" | "assassin" | "light" | "angel";
export type Side = 0 | 1;
/** 0 toward the far edge (−z), 1 right (+x), 2 toward the near edge (+z), 3 left (−x). */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1],
  DZ = [-1, 0, 1, 0];
export const SIDES: [string, string] = ["청군", "홍군"];

export interface Stats {
  name: string;
  hp: number;
  /** Attack (or, for the healer, nothing: she heals `HEAL`). */
  power: number;
  def: number;
  speed: number;
  move: number;
  /** How many levels a step may climb or drop. */
  jump: number;
  /** What its attack reaches, in words. */
  reach: string;
  /** What it does, in a line. */
  note: string;
}
export const JOBS: Record<Job, Stats> = {
  knight: { name: "기사", hp: 52, power: 16, def: 6, speed: 7, move: 3, jump: 1, reach: "바로 옆 1칸", note: "두꺼운 갑옷과 긴 칼. 느리지만 단단하고 세게 벱니다." },
  archer: { name: "궁수", hp: 34, power: 13, def: 3, speed: 10, move: 4, jump: 2, reach: "2~5칸 (바로 옆은 못 쏨)", note: "화살은 앞을 가로막는 것을 넘어 날아갑니다." },
  fire: { name: "불꽃 마법사", hp: 28, power: 13, def: 2, speed: 8, move: 3, jump: 1, reach: "4칸 안, 십자 5칸", note: "떨어진 곳과 그 상하좌우를 태웁니다. 아군도, 자신도 맞습니다." },
  healer: { name: "치유사", hp: 30, power: 0, def: 2, speed: 10, move: 4, jump: 2, reach: "바로 옆 아군이나 자신", note: `다친 아군 하나의 체력을 ${HEAL} 되돌립니다. 공격은 하지 못합니다.` },
  assassin: { name: "그림자 암살자", hp: 30, power: 14, def: 2, speed: 13, move: 6, jump: 3, reach: "바로 옆 1칸", note: "가장 빠르고 멀리 움직입니다. 뒤에서 찌르면 두 배로 아픕니다." },
  light: { name: "빛의 마법사", hp: 28, power: 12, def: 2, speed: 10, move: 3, jump: 1, reach: "한 방향 일직선 4칸", note: "빛줄기가 닿는 모든 것을 맞힙니다. 아군도 맞습니다. 바위와 나무에서 멈춥니다." },
  angel: { name: "천사", hp: 1, power: 0, def: 0, speed: 12, move: 5, jump: 9, reach: `${ANGEL_RANGE}칸 안 어디든`, note: "어떤 적이든 한 번에 쓰러뜨립니다. 대신 한 대만 맞아도 쓰러집니다. 날아서 움직입니다." },
};
/** The six of a side, in the order their numbers are given (two sides alternate, so that ties go by this order). */
export const ARMY: Job[] = ["knight", "assassin", "archer", "fire", "healer", "light"];
/** Where side 0 (the near edge) starts, by `ARMY` (row, column); side 1 stands at the mirror image. */
const START: [number, number][] = [
  [8, 4],
  [8, 6],
  [9, 2],
  [9, 3],
  [9, 5],
  [9, 6],
];

export interface Field {
  id: string;
  name: string;
  ground: Ground[];
  height: number[];
}
/**
 * The maps: the near half (rows 5 to 9) as letters (g grass, s stone, d dirt, w water, r rock, t tree, b bridge) and
 * heights (0 to 3); the far half is the near half turned half round, so that both sides meet the same ground.
 */
const PLANS: { id: string; name: string; ground: string[]; height: string[] }[] = [
  {
    id: "forest",
    name: "숲 속 공터",
    ground: ["gggdgwwggg", "ggtggdgggg", "gggggdgtgg", "gtgggdgggt", "tgggddggtt"],
    height: ["1210000123", "0110000122", "0000000111", "0000000001", "1000000011"],
  },
  {
    id: "wall",
    name: "성벽 앞",
    ground: ["srssddssss", "ggsrssrsgg", "ggggddgggg", "dggssssggd", "ddggggggdd"],
    height: ["2222003222", "0012112100", "0000000000", "0001111000", "0000000000"],
  },
  {
    id: "river",
    name: "강가 다리",
    ground: ["wwbrwwwbww", "gggggddddd", "ggrgddgggg", "ggggdggtgg", "tgggdggggt"],
    height: ["0000000000", "0000000000", "1111001111", "1121011111", "2221011222"],
  },
];
const LETTERS: Record<string, Ground> = { g: "grass", s: "stone", d: "dirt", w: "water", r: "rock", t: "tree", b: "bridge" };
export const FIELDS = PLANS.map(({ id, name }) => ({ id, name }));
const fields = new Map<string, Field>();
export function fieldOf(id: string): Field {
  const plan = PLANS.find((p) => p.id === id) ?? PLANS[0],
    known = fields.get(plan.id);
  if (known) return known;
  const ground: Ground[] = [],
    height: number[] = [];
  for (let r = 0; r < D; r++)
    for (let c = 0; c < W; c++) {
      const [R, C] = r >= 5 ? [r, c] : [D - 1 - r, W - 1 - c];
      ground.push(LETTERS[plan.ground[R - 5][C]]);
      height.push(Number(plan.height[R - 5][C]));
    }
  const field = { id: plan.id, name: plan.name, ground, height };
  fields.set(plan.id, field);
  return field;
}

export interface Unit {
  /** Its number: also the order in which ties are settled. */
  id: number;
  side: Side;
  job: Job;
  hp: number;
  max: number;
  /** Its tile, or -1 once it has fallen. */
  cell: number;
  facing: Dir;
  charge: number;
}
export type Aim = "move" | "attack" | null;
export type Facing = "front" | "side" | "back";
export interface Hit {
  id: number;
  /** Damage taken, or health given back by a heal. */
  amount: number;
  heal: boolean;
  fell: boolean;
  from: Facing;
}
/** What the last command did, for the field to show. */
export interface Last {
  kind: "move" | "attack" | "heal" | "wait" | "undo";
  unit: number;
  /** What the unit was when it acted. */
  job: Job;
  /** A walk: the tiles from where it stood to where it stops; a move taken back: from where it was to where it goes back. */
  path?: number[];
  /** A strike: the tile aimed at (for a beam, the first tile of its line) and every tile it reaches. */
  target?: number;
  area?: number[];
  hits?: Hit[];
  /** Healers who became the angel by this command. */
  angels?: number[];
}
export interface State {
  field: string;
  units: Unit[];
  /** The unit whose turn it is. */
  active: number;
  moved: boolean;
  acted: boolean;
  /** Where the active unit stood and looked before it moved, for 되돌리기. */
  origin: { cell: number; facing: Dir } | null;
  /** What the player is choosing: a tile to move to, a target, or neither (the commands). */
  aim: Aim;
  /** The target whose reach is shown, waiting for a second tap; -1 for none. */
  preview: number;
  ply: number;
  /** Turns of units ended so far. */
  turns: number;
  winner: Winner;
  last: Last | null;
}

export const rowOf = (cell: number) => Math.floor(cell / W),
  colOf = (cell: number) => cell % W,
  cellAt = (row: number, col: number) => (row < 0 || row >= D || col < 0 || col >= W ? -1 : row * W + col);
export const distance = (a: number, b: number) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
export const passable = (g: Ground) => g !== "water" && g !== "rock" && g !== "tree";
/** What stops a beam of light: rocks and trees. */
const stopsBeam = (g: Ground) => g === "rock" || g === "tree";
export const neighbour = (cell: number, dir: number) => cellAt(rowOf(cell) + DZ[dir], colOf(cell) + DX[dir]);
const alive = (u: Unit) => u.hp > 0;

export function createGame(variant = "forest"): State {
  const field = fieldOf(variant),
    units: Unit[] = [];
  ARMY.forEach((job, k) => {
    for (const side of [0, 1] as Side[]) {
      const [r, c] = START[k],
        cell = side === 0 ? cellAt(r, c) : cellAt(D - 1 - r, W - 1 - c),
        stats = JOBS[job];
      units.push({ id: units.length, side, job, hp: stats.hp, max: stats.hp, cell, facing: side === 0 ? 0 : 2, charge: 0 });
    }
  });
  return { field: field.id, units, active: nextActor(units), moved: false, acted: false, origin: null, aim: null, preview: -1, ply: 0, turns: 0, winner: null, last: null };
}
/** The unit standing on each tile, or -1. */
export function occupancy(state: State) {
  const at = new Int8Array(CELLS).fill(-1);
  for (const u of state.units) if (alive(u)) at[u.cell] = u.id;
  return at;
}
/** Ticks the charges until some unit has 100: the one with the most acts, ties to the lower number. Changes `units`. */
function nextActor(units: Unit[]) {
  for (let guard = 0; guard < 1000; guard++) {
    let best = -1;
    for (const u of units) if (alive(u) && u.charge >= 100 && (best < 0 || u.charge > units[best].charge)) best = u.id;
    if (best >= 0) return best;
    for (const u of units) if (alive(u)) u.charge += JOBS[u.job].speed;
  }
  return units.findIndex(alive);
}
/** The next `count` units to act, the active one first, supposing each pays a whole turn. */
export function queue(state: State, count = 8): number[] {
  const units = state.units.map((u) => ({ ...u })),
    order = [state.active];
  if (state.winner !== null) return order;
  units[state.active].charge -= 100;
  while (order.length < count) {
    const next = nextActor(units);
    order.push(next);
    units[next].charge -= 100;
  }
  return order;
}
/**
 * Where a unit can walk to this turn: every empty tile within its move whose steps each climb or drop no more than
 * its jump, past its own side but not through the other's (the angel flies over everything). `prev` leads each
 * tile reached back to where the unit stands.
 */
export function reach(state: State, unit: Unit) {
  const field = fieldOf(state.field),
    stats = JOBS[unit.job],
    fly = unit.job === "angel",
    at = occupancy(state),
    prev = new Map<number, number>([[unit.cell, -1]]),
    dests: number[] = [];
  let frontier = [unit.cell];
  for (let step = 0; step < stats.move && frontier.length; step++) {
    const next: number[] = [];
    for (const cell of frontier)
      for (let d = 0; d < 4; d++) {
        const n = neighbour(cell, d);
        if (n < 0 || prev.has(n)) continue;
        if (!fly) {
          if (!passable(field.ground[n]) || Math.abs(field.height[n] - field.height[cell]) > stats.jump) continue;
          if (at[n] >= 0 && state.units[at[n]].side !== unit.side) continue;
        }
        prev.set(n, cell);
        next.push(n);
        if (passable(field.ground[n]) && at[n] < 0) dests.push(n);
      }
    frontier = next;
  }
  return { dests, prev };
}
/** The tiles from where `unit` stands to `dest`, by `prev` of `reach`. */
export function pathTo(prev: Map<number, number>, dest: number) {
  const path: number[] = [];
  for (let c = dest; c !== -1 && c !== undefined; c = prev.get(c)!) path.unshift(c);
  return path;
}
/** The four lines of light a beam may take from `from`, each up to four tiles, stopped by rocks, trees and the edge. */
export function beams(state: State, from: number) {
  const field = fieldOf(state.field);
  return [0, 1, 2, 3].map((d) => {
    const line: number[] = [];
    for (let n = neighbour(from, d), k = 0; k < 4 && n >= 0 && !stopsBeam(field.ground[n]); k++, n = neighbour(n, d)) line.push(n);
    return line;
  });
}
const RANGE: Partial<Record<Job, [number, number]>> = { archer: [2, 5], fire: [1, 4], angel: [1, ANGEL_RANGE] };
/**
 * Every tile `unit` could aim at if it stood on `from`: the enemy beside it (knight, assassin), an enemy two to five
 * away (archer), any tile within four (fire), any tile of its four beams (light), a hurt friend beside it or
 * itself (healer), any enemy within eight (angel).
 */
export function targetsFrom(state: State, unit: Unit, from: number): number[] {
  const field = fieldOf(state.field),
    others = state.units.filter((u) => alive(u) && u.id !== unit.id);
  const near = (u: Unit) => distance(from, u.cell) === 1 && Math.abs(field.height[from] - field.height[u.cell]) <= 2;
  switch (unit.job) {
    case "knight":
    case "assassin":
      return others.filter((u) => u.side !== unit.side && near(u)).map((u) => u.cell);
    case "archer":
    case "angel": {
      const [lo, hi] = RANGE[unit.job]!;
      return others.filter((u) => u.side !== unit.side && distance(from, u.cell) >= lo && distance(from, u.cell) <= hi).map((u) => u.cell);
    }
    case "fire": {
      const out: number[] = [];
      for (let c = 0; c < CELLS; c++) if (distance(from, c) >= 1 && distance(from, c) <= 4) out.push(c);
      return out;
    }
    case "light":
      return beams(state, from).flat();
    case "healer": {
      const out = others.filter((u) => u.side === unit.side && u.hp < u.max && near(u)).map((u) => u.cell);
      return unit.hp < unit.max ? [from, ...out] : out;
    }
  }
}
/** The tile a strike at `cell` stands for: for a beam, the first tile of the line `cell` lies on. */
export function canonical(state: State, from: number, unit: Unit, cell: number) {
  if (unit.job !== "light") return cell;
  return beams(state, from).find((line) => line.includes(cell))?.[0] ?? cell;
}
/** Every tile a strike at `target` from `from` reaches. */
export function areaOf(state: State, unit: Unit, from: number, target: number): number[] {
  if (unit.job === "fire") return [target, ...[0, 1, 2, 3].map((d) => neighbour(target, d)).filter((n) => n >= 0)];
  if (unit.job === "light") return beams(state, from).find((line) => line.includes(target)) ?? [target];
  return [target];
}
/** From which side a unit at `at` looking `facing` is struck from `from`. */
export function relation(facing: Dir, at: number, from: number): Facing {
  const dx = colOf(from) - colOf(at),
    dz = rowOf(from) - rowOf(at),
    ahead = dx * DX[facing] + dz * DZ[facing],
    across = Math.abs(dx * DZ[facing] - dz * DX[facing]);
  if (ahead > across || (ahead === 0 && across === 0)) return "front";
  if (-ahead > across) return "back";
  return "side";
}
/**
 * What a strike from `from` does to `target`: attack less defence (at least 1), a quarter more from higher ground and
 * a quarter less from lower, half more from behind (twice as much for the assassin) and a quarter more from the side.
 * The angel's strike kills at once, and any strike kills the angel.
 */
export function damageOf(state: State, attacker: Unit, from: number, target: Unit, at = target.cell): { amount: number; from: Facing } {
  const side = relation(target.facing, at, from);
  if (attacker.job === "angel" || target.job === "angel") return { amount: target.hp, from: side };
  const field = fieldOf(state.field),
    base = Math.max(1, JOBS[attacker.job].power - JOBS[target.job].def),
    rise = field.height[from] - field.height[at];
  let times = rise > 0 ? 1.25 : rise < 0 ? 0.75 : 1;
  if (side === "back") times *= attacker.job === "assassin" ? 2 : 1.5;
  else if (side === "side") times *= 1.25;
  return { amount: Math.max(1, Math.round(base * times)), from: side };
}
/** What a strike at `target` by `unit` standing on `from` does to every unit it reaches (the unit itself included). */
export function hitsOf(state: State, unit: Unit, from: number, target: number): Hit[] {
  const area = areaOf(state, unit, from, target),
    hits: Hit[] = [];
  for (const v of state.units) {
    if (!alive(v)) continue;
    const at = v.id === unit.id ? from : v.cell;
    if (!area.includes(at)) continue;
    // A healer heals the one aimed at, and strikes nobody.
    if (unit.job === "healer") {
      if (at === target && v.side === unit.side) hits.push({ id: v.id, amount: Math.min(HEAL, v.max - v.hp), heal: true, fell: false, from: "front" });
      continue;
    }
    // The single strikes reach only an enemy; fire and light reach everyone in their way.
    if (v.side === unit.side && unit.job !== "fire" && unit.job !== "light") continue;
    const { amount, from: side } = damageOf(state, unit, from, v, at);
    hits.push({ id: v.id, amount, heal: false, fell: amount >= v.hp, from: side });
  }
  return hits;
}
/** Which way to look from `from` toward `to`: along the longer of the two directions, along the depth on a tie. */
export function toward(from: number, to: number, current: Dir): Dir {
  const dx = colOf(to) - colOf(from),
    dz = rowOf(to) - rowOf(from);
  if (dx === 0 && dz === 0) return current;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}
export const activeUnit = (state: State) => state.units[state.active];
export const canMove = (state: State) => !state.moved && reach(state, activeUnit(state)).dests.length > 0;
export const canAct = (state: State) => !state.acted && targetsFrom(state, activeUnit(state), activeUnit(state).cell).length > 0;
const command = (to: number): Move => ({ from: -1, to, extra: -1 });
/**
 * What the player may tap now: the commands; or, while choosing where to go or what to strike, those tiles and
 * 취소. Empty once the battle is over.
 */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const unit = activeUnit(state);
  if (state.aim === "move") return [...reach(state, unit).dests.map(command), command(CANCEL)];
  if (state.aim === "attack") return [...targetsFrom(state, unit, unit.cell).map(command), command(CANCEL)];
  const out: Move[] = [];
  if (canMove(state)) out.push(command(AIM_MOVE));
  if (canAct(state)) out.push(command(AIM_ACT));
  out.push(command(WAIT));
  if (state.moved && !state.acted) out.push(command(UNDO));
  return out;
}
/** Every walk and strike the active unit can make now, as direct moves (the computer's, and the tests'). */
export function actions(state: State): Move[] {
  if (state.winner !== null) return [];
  const unit = activeUnit(state),
    out: Move[] = [];
  if (!state.moved) for (const to of reach(state, unit).dests) out.push({ from: unit.cell, to, extra: STEP });
  if (!state.acted) {
    const seen = new Set<number>();
    for (const t of targetsFrom(state, unit, unit.cell)) {
      const to = canonical(state, unit.cell, unit, t);
      if (seen.has(to)) continue;
      seen.add(to);
      out.push({ from: unit.cell, to, extra: STRIKE });
    }
  }
  return out;
}
/** A copy of the state that may be changed: its own units. */
const fresh = (state: State): State => ({ ...state, units: state.units.map((u) => ({ ...u })) });
/** Ends the active unit's turn, paying `cost` of its charge, and hands the turn on (or calls a draw). Changes `s`. */
function finish(s: State, cost: number): State {
  const me = s.units[s.active];
  if (alive(me)) me.charge -= cost;
  s.turns++;
  s.moved = s.acted = false;
  s.origin = null;
  s.aim = null;
  s.preview = -1;
  if (s.winner === null && s.turns >= LIMIT) s.winner = "draw";
  if (s.winner === null) s.active = nextActor(s.units);
  return s;
}
function walk(state: State, dest: number): State {
  const unit = activeUnit(state),
    path = pathTo(reach(state, unit).prev, dest),
    s = fresh(state),
    me = s.units[s.active];
  s.origin = { cell: unit.cell, facing: unit.facing };
  me.cell = dest;
  me.facing = toward(path[path.length - 2], dest, unit.facing);
  s.moved = true;
  s.aim = null;
  s.preview = -1;
  s.ply++;
  s.last = { kind: "move", unit: me.id, job: me.job, path };
  return state.acted ? finish(s, 100) : s;
}
function strike(state: State, target: number): State {
  const unit = activeUnit(state),
    hits = hitsOf(state, unit, unit.cell, target),
    s = fresh(state),
    me = s.units[s.active];
  me.facing = toward(unit.cell, target, unit.facing);
  for (const hit of hits) {
    const v = s.units[hit.id];
    v.hp = hit.heal ? Math.min(v.max, v.hp + hit.amount) : Math.max(0, v.hp - hit.amount);
    if (!alive(v)) {
      v.cell = -1;
      v.charge = 0;
    }
  }
  // A healer left alone on her side becomes the angel.
  const angels: number[] = [];
  for (const side of [0, 1] as Side[]) {
    const left = s.units.filter((u) => u.side === side && alive(u));
    if (left.length === 1 && left[0].job === "healer") {
      left[0].job = "angel";
      left[0].hp = left[0].max = JOBS.angel.hp;
      angels.push(left[0].id);
    }
  }
  const standing = [0, 1].map((side) => s.units.some((u) => u.side === side && alive(u)));
  s.winner = !standing[0] && !standing[1] ? "draw" : !standing[1] ? 0 : !standing[0] ? 1 : null;
  s.acted = true;
  s.aim = null;
  s.preview = -1;
  s.ply++;
  s.last = { kind: unit.job === "healer" ? "heal" : "attack", unit: me.id, job: unit.job, target, area: areaOf(state, unit, unit.cell, target), hits, ...(angels.length ? { angels } : {}) };
  if (s.winner !== null) return s;
  // A caster caught in her own fire ends her turn where she falls.
  if (!alive(me)) return finish(s, 0);
  return state.moved ? finish(s, 100) : s;
}
function rest(state: State): State {
  const s = fresh(state);
  s.ply++;
  s.last = { kind: "wait", unit: s.active, job: activeUnit(state).job };
  return finish(s, state.moved || state.acted ? 100 : 50);
}
function back(state: State): State | null {
  if (!state.moved || state.acted || !state.origin) return null;
  const s = fresh(state),
    me = s.units[s.active],
    from = me.cell;
  me.cell = state.origin.cell;
  me.facing = state.origin.facing;
  s.moved = false;
  s.origin = null;
  s.aim = null;
  s.preview = -1;
  s.ply++;
  s.last = { kind: "undo", unit: me.id, job: me.job, path: [from, me.cell] };
  return s;
}
/** The state after `move`, or null when it is not legal now. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null) return null;
  const unit = activeUnit(state);
  if (move.from === -1) {
    if (move.extra !== -1) return null;
    const to = move.to;
    if (to === AIM_MOVE) return state.aim !== "move" && canMove(state) ? { ...state, aim: "move", preview: -1 } : null;
    if (to === AIM_ACT) return state.aim !== "attack" && canAct(state) ? { ...state, aim: "attack", preview: -1 } : null;
    if (to === CANCEL) return state.aim !== null ? { ...state, aim: null, preview: -1 } : null;
    if (to === WAIT) return rest(state);
    if (to === UNDO) return back(state);
    if (to < 0 || to >= CELLS) return null;
    if (state.aim === "move") return reach(state, unit).dests.includes(to) ? walk(state, to) : null;
    if (state.aim === "attack") {
      if (!targetsFrom(state, unit, unit.cell).includes(to)) return null;
      const aimed = canonical(state, unit.cell, unit, to);
      // The first tap shows what the strike reaches; a second on it strikes.
      return state.preview === aimed ? strike(state, aimed) : { ...state, preview: aimed };
    }
    return null;
  }
  if (move.from !== unit.cell) return null;
  if (move.extra === STEP) return !state.moved && reach(state, unit).dests.includes(move.to) ? walk(state, move.to) : null;
  if (move.extra === STRIKE) return !state.acted && targetsFrom(state, unit, unit.cell).includes(move.to) ? strike(state, canonical(state, unit.cell, unit, move.to)) : null;
  return null;
}
export const standing = (state: State, side: Side) => state.units.filter((u) => u.side === side && alive(u));
/** The unit's name with its side, for the status line. */
export const named = (unit: Unit) => `${SIDES[unit.side]} ${JOBS[unit.job].name}`;
const objectOf = (word: string) => (/[가-힣]$/.test(word) && (word.charCodeAt(word.length - 1) - 0xac00) % 28 ? "을" : "를");
export function hint(state: State): string {
  const unit = activeUnit(state),
    who = JOBS[unit.job].name;
  if (state.aim === "move") return `${who}: 파란 칸을 눌러 옮기세요.`;
  if (state.aim === "attack") {
    if (state.preview >= 0) {
      const hits = hitsOf(state, unit, unit.cell, state.preview),
        friends = hits.filter((h) => !h.heal && state.units[h.id].side === unit.side).length;
      if (unit.job === "healer") return `${who}: 같은 칸을 다시 누르면 회복합니다.`;
      return `${who}: 같은 칸을 다시 누르면 공격합니다.${friends ? ` 아군 ${friends}명도 맞습니다!` : ""}`;
    }
    if (unit.job === "healer") return `${who}: 회복할 아군을 고르세요.`;
    if (unit.job === "fire") return `${who}: 불길을 떨어뜨릴 칸을 고르세요.`;
    if (unit.job === "light") return `${who}: 빛줄기를 쏠 쪽을 고르세요.`;
    return `${who}: 공격할 적을 고르세요.`;
  }
  const can: string[] = [];
  if (canMove(state)) can.push("이동");
  if (canAct(state)) can.push(unit.job === "healer" ? "회복" : "공격");
  if (state.moved && !state.acted) can.push("되돌리기");
  can.push("대기");
  return `${who}: ${can.join(", ")} 가운데 고르세요.`;
}
export function reason(state: State): string {
  if (state.winner === "draw")
    return standing(state, 0).length || standing(state, 1).length ? `${LIMIT}번의 차례가 지나도록 승부가 나지 않았습니다.` : "두 편이 함께 모두 쓰러졌습니다.";
  if (state.winner === null) return "";
  const won = SIDES[state.winner],
    lost = SIDES[1 - state.winner],
    left = standing(state, state.winner).length;
  return `${won}이 ${lost}${objectOf(lost)} 모두 물리쳤습니다. ${won}은 ${left}명이 남았습니다.`;
}
/** How the armies stand for `player`: what is left of each, a fallen unit counting more than a hurt one. */
export function evaluate(state: State, player: Side) {
  const worth = (side: number) => state.units.filter((u) => u.side === side && alive(u)).reduce((n, u) => n + 10 + (20 * u.hp) / u.max, 0);
  return worth(player) - worth(1 - player);
}
export const tactics: PointGame<State> = {
  create: (variant) => createGame(variant),
  moves,
  play: (state, move) => play(state, move),
  turn: (state) => activeUnit(state).side,
  winner: (state) => state.winner,
  owners: (state) => {
    const out: (0 | 1 | null)[] = Array(CELLS).fill(null);
    for (const u of state.units) if (alive(u)) out[u.cell] = u.side;
    return out;
  },
  effect: () => null,
  ply: (state) => state.ply,
  evaluate: (state, player) => evaluate(state, player),
  hint,
  tally: (state) => [`${standing(state, 0).length}명`, `${standing(state, 1).length}명`],
  reason,
};
