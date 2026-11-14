import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { copy, settle, shotCode, shotOf, speedOf, strike, type Arena, type Disc } from "../flick/physics";

/**
 * Carrom: nine white and nine black men and a red queen lie in the middle of
 * a square board with a pocket in each corner. A side flicks the striker
 * from its own base line to drive its men into the pockets. Pocketing one of
 * its own lets it shoot again; the first to pocket all nine wins.
 */
export const HALF = 5,
  ARENA: Arena = {
    halfX: HALF,
    halfZ: HALF,
    cushions: true,
    pockets: [-1, 1].flatMap((x) => [-1, 1].map((z) => ({ x: x * (HALF - 0.32), z: z * (HALF - 0.32), r: 0.46 }))),
    friction: 5.5,
    bounce: 0.82,
  },
  /** How far each base line lies from the middle, and how far along it the striker may stand. */
  BASE = 3.55,
  REACH = 2.7,
  SLOTS = 28,
  MAN = 0.23,
  STRIKER = 19,
  QUEEN = 18;
/** Where along the base line a slot puts the striker. */
export const slotX = (slot: number) => -REACH + (slot / (SLOTS - 1)) * REACH * 2;
export interface State {
  /** 0–8 white (side 0), 9–17 black (side 1), 18 the queen, 19 the striker. */
  discs: Disc[];
  turn: 0 | 1;
  winner: Winner;
  /** Who holds the queen for good; who has pocketed it and must still cover it with one of their own. */
  queen: 0 | 1 | null;
  cover: 0 | 1 | null;
  last: { code: number; slot: number; by: 0 | 1 } | null;
  /** What the last shot pocketed, and whether it was a foul. */
  sunk: number[];
  foul: boolean;
  ply: number;
}
const disc = (id: number, x: number, z: number, r: number, m: number, on = true): Disc => ({ id, x, z, vx: 0, vz: 0, r, m, on });
export function createGame(): State {
  const discs: Disc[] = [],
    gap = MAN * 2 + 0.02,
    // The queen in the middle, six men round it and twelve round those, the colours alternating.
    spots: [number, number][] = [];
  for (let k = 0; k < 6; k++) spots.push([Math.cos((k * Math.PI) / 3) * gap, Math.sin((k * Math.PI) / 3) * gap]);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6,
      d = k % 2 ? gap * Math.sqrt(3) : gap * 2;
    spots.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  const colours = spots.map((_, i) => i % 2);
  for (const side of [0, 1])
    spots.forEach(([x, z], i) => {
      if (colours[i] === side) discs.push(disc(discs.length, x, z, MAN, 1));
    });
  discs.push(disc(QUEEN, 0, 0, MAN, 1));
  discs.push(disc(STRIKER, 0, BASE, 0.31, 1.7, false));
  return { discs, turn: 0, winner: null, queen: null, cover: null, last: null, sunk: [], foul: false, ply: 0 };
}
export const owner = (id: number) => (id < 9 ? 0 : id < 18 ? 1 : null);
export const left = (state: State, side: number) => state.discs.filter((d) => d.on && owner(d.id) === side).length;
/** Puts a man back near the middle, clear of the others. */
function respot(discs: Disc[], id: number) {
  const d = discs[id];
  for (let ring = 0; ring < 40; ring++) {
    const a = ring * 2.4,
      r = ring * 0.12,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (discs.every((o) => o === d || !o.on || Math.hypot(o.x - x, o.z - z) > o.r + d.r + 0.01)) {
      d.x = x;
      d.z = z;
      d.on = true;
      return;
    }
  }
}
/** Whether the striker can stand at a slot of the mover's base line. */
export function clear(state: State, slot: number) {
  const x = slotX(slot),
    z = state.turn === 0 ? BASE : -BASE;
  return state.discs.every((d) => d.id === STRIKER || !d.on || Math.hypot(d.x - x, d.z - z) > d.r + 0.31);
}
/** Shots that send the striker at a man so as to drive it toward a pocket. */
export function aimed(state: State): Move[] {
  const me = state.turn,
    z = me === 0 ? BASE : -BASE,
    out: Move[] = [];
  for (const target of state.discs) {
    if (!target.on || target.id === STRIKER || owner(target.id) === (me ? 0 : 1)) continue;
    for (const pocket of ARENA.pockets) {
      // Where the striker's middle must be when it meets the man, to send it at the pocket.
      const dx = target.x - pocket.x,
        dz = target.z - pocket.z,
        d = Math.hypot(dx, dz),
        gx = target.x + (dx / d) * (target.r + 0.31),
        gz = target.z + (dz / d) * (target.r + 0.31);
      for (let slot = 1; slot < SLOTS; slot += 3) {
        if (!clear(state, slot)) continue;
        const angle = Math.atan2(gz - z, gx - slotX(slot));
        // Only forward, away from the shooter's own side.
        if (me === 0 ? Math.sin(angle) > -0.12 : Math.sin(angle) < 0.12) continue;
        for (const power of [9, 14]) out.push({ from: STRIKER, to: shotCode((angle * 180) / Math.PI, power), extra: slot });
      }
    }
  }
  // Something must always be playable: a plain shot up the board.
  if (!out.length)
    for (let slot = 0; slot < SLOTS; slot++) if (clear(state, slot)) out.push({ from: STRIKER, to: shotCode(me === 0 ? 270 : 90, 12), extra: slot });
  return out;
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : aimed(state));
export function play(state: State, move: Move): State | null {
  const shot = shotOf(move.to),
    me = state.turn,
    other = (me ? 0 : 1) as 0 | 1;
  if (state.winner !== null || move.from !== STRIKER || !shot || !Number.isInteger(move.extra) || move.extra < 0 || move.extra >= SLOTS || !clear(state, move.extra))
    return null;
  if (me === 0 ? Math.sin(shot.angle) > 0 : Math.sin(shot.angle) < 0) return null;
  const discs = copy(state.discs),
    striker = discs[STRIKER];
  striker.x = slotX(move.extra);
  striker.z = me === 0 ? BASE : -BASE;
  striker.on = true;
  strike(striker, shot.angle, speedOf(shot.power));
  const { gone } = settle(discs, ARENA),
    foul = gone.includes(STRIKER),
    mine = gone.filter((id) => owner(id) === me),
    gotQueen = gone.includes(QUEEN);
  striker.on = false;
  let queen = state.queen,
    cover = state.cover;
  if (foul) {
    // The striker went down: one of the shooter's pocketed men comes back, and so does a queen not yet covered.
    const back = mine[0] ?? [...Array(9).keys()].map((k) => k + me * 9).find((id) => !discs[id].on);
    if (back !== undefined) respot(discs, back);
    if (gotQueen || cover === me) {
      respot(discs, QUEEN);
      cover = null;
    }
  } else {
    if (cover === me) {
      // The queen pocketed on the last shot is covered by a man now, or goes back.
      if (mine.length) queen = me;
      else respot(discs, QUEEN);
      cover = null;
    }
    if (gotQueen) {
      if (mine.length) queen = me;
      else cover = me;
    }
  }
  const again = !foul && (mine.length > 0 || (gotQueen && cover === me)),
    done = [0, 1].map((side) => left({ ...state, discs }, side) === 0);
  return {
    ...state,
    discs,
    queen,
    cover,
    turn: again ? me : other,
    last: { code: move.to, slot: move.extra, by: me },
    sunk: gone,
    foul,
    ply: state.ply + 1,
    winner: done[0] && done[1] ? "draw" : done[0] ? 0 : done[1] ? 1 : null,
  };
}
/** The computer tries its aimed shots in its head and keeps the best, with a finger less sure at the lower levels. */
export function chooseShot(state: State, level: Level, random: Random = Math.random): Move | null {
  const me = state.turn;
  let best: Move | null = null,
    top = -Infinity;
  for (const move of aimed(state)) {
    const next = play(state, move);
    if (!next) continue;
    const own = next.sunk.filter((id) => owner(id) === me).length,
      theirs = next.sunk.filter((id) => owner(id) === (me ? 0 : 1)).length,
      score = own * 10 + (next.sunk.includes(QUEEN) ? 6 : 0) - theirs * 7 - (next.foul ? 16 : 0) + (next.winner === me ? 100 : 0) + random() * (level === "easy" ? 14 : 1);
    if (score > top) {
      top = score;
      best = move;
    }
  }
  if (!best) return null;
  const shot = shotOf(best.to)!,
    wobble = level === "easy" ? 6 : level === "normal" ? 2.2 : 0.5,
    degrees = shot.degrees + (random() * 2 - 1) * wobble,
    code = shotCode(degrees, shot.power);
  // A wobble must not turn the shot backward.
  return play(state, { ...best, to: code }) ? { ...best, to: code } : best;
}
const effect = (state: State): Effect | null => (state.last ? { kind: "move", from: STRIKER, to: STRIKER, converted: [], removed: state.sunk } : null);
export const carrom: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseShot,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.discs.map((d) => (d.on ? owner(d.id) : null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => left(s, player ? 0 : 1) - left(s, player),
  hint: (s) =>
    s.cover === s.turn
      ? "여왕을 넣었습니다. 이번에 내 말을 넣어야 여왕을 갖습니다."
      : s.foul && s.last?.by !== s.turn
        ? "상대가 스트라이커를 빠뜨렸습니다. 스트라이커를 당겼다 놓아 치세요."
        : "밑줄의 스트라이커를 당겼다 놓아 내 말을 구멍에 넣으세요.",
  tally: (s) => [0, 1].map((p) => `넣은 말 ${9 - left(s, p)} / 9${s.queen === p ? " · 여왕" : ""}`) as [string, string],
  reason: (s) => (s.winner === "draw" ? "두 사람의 말이 함께 모두 들어갔습니다." : "자기 말 아홉 개를 먼저 모두 넣었습니다."),
};
