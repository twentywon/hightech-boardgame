import type { Effect, GameOptions, Move, PointGame, Winner } from "../points/types";
import { COMBO, TIERS, tierOf } from "./bb";
import { CLAYS } from "./clay";
import { CARTRIDGES, KINDS, SESSION, ZONE_NAME, type Zone } from "./hunt";
import { modeOf, type Mode } from "./layout";

/**
 * 사격: three ways to shoot, each played in real time by the view (see `sim.ts`); the moves are what it reports.
 *
 * - 비비탄 사격 (`bb`): a round of pellets at the arcade booth. `SHOT` spends a pellet; a lit target struck is a move to
 *   `HIT + points` (its `extra` the combo it made). The round is over at `DONE`, once the last pellet has landed.
 * - 클레이 사격 (`clay`): `CLAYS` clays. `LAUNCH` throws one, `SHOT` fires a barrel, `BREAK` (its `extra` the barrel, 1
 *   or 2) breaks it and `LOST` lets it fall whole; the round is over with the last clay's result.
 * - 사냥 (`hunt`): `SESSION` seconds in the wood. `TICK` is a second gone by, `SHOT` spends a cartridge, `WOUND` is a
 *   hit that did not take the animal (its `extra` the zone), `TAKE + kind` takes one (`extra` the zone), `ESCAPE` an
 *   animal that got away; the hunt is over when the clock runs out, or at `DONE` once the cartridges are spent.
 *
 * Nothing here is random: where a shot goes and what it strikes are decided by the world's own simulation from the
 * aim and the sights' misalignment at the moment of the shot.
 */
export const TICK = 0,
  SHOT = 1,
  LAUNCH = 2,
  LOST = 3,
  DONE = 4,
  ESCAPE = 5,
  WOUND = 6,
  BREAK = 7,
  /** A lit target struck: `HIT + points`; the most a single pellet can score. */
  HIT = 100,
  MOST = 300,
  /** An animal taken: `TAKE + its kind's index`. */
  TAKE = 1000;
export const ZONES: Zone[] = ["head", "body", "legs", "wing"];
export interface State {
  mode: Mode;
  /** The BB round's tier (0 동, 1 은, 2 금). */
  tier: number;
  score: number;
  /** Pellets or cartridges left in all (the clay range loads two shells a clay). */
  ammo: number;
  shots: number;
  hits: number;
  /** The BB combo of the last hit, and the best of the round. */
  combo: number;
  best: number;
  /** Clays thrown, and each clay's result (0 lost, 1 or 2 the barrel that broke it). */
  thrown: number;
  card: number[];
  /** The hunt's seconds left, animals taken by kind (in `KINDS` order), and animals that got away. */
  left: number;
  bag: number[];
  escaped: number;
  winner: Winner;
  last: number | null;
  lastExtra: number;
  ply: number;
}
export const broken = (state: State) => state.card.filter((r) => r > 0).length;
export function createGame(variant = "bb", options: GameOptions = {}): State {
  const mode = modeOf(variant),
    tier = mode === "bb" ? Math.max(0, Math.min(TIERS.length - 1, Number(options.tier ?? 0) || 0)) : 0;
  return {
    mode,
    tier,
    score: 0,
    ammo: mode === "bb" ? tierOf(tier).pellets : mode === "hunt" ? CARTRIDGES : CLAYS * 2,
    shots: 0,
    hits: 0,
    combo: 0,
    best: 0,
    thrown: 0,
    card: [],
    left: SESSION,
    bag: KINDS.map(() => 0),
    escaped: 0,
    winner: null,
    last: null,
    lastExtra: -1,
    ply: 0,
  };
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const m = (to: number, extra = -1): Move => ({ from: -1, to, extra });
  if (state.mode === "bb") return [m(SHOT), m(DONE), ...Array.from({ length: MOST }, (_, k) => m(HIT + k + 1, 1))];
  if (state.mode === "clay") return [m(SHOT), m(LAUNCH), m(LOST), m(BREAK, 1), m(BREAK, 2)];
  return [m(TICK), m(SHOT), m(DONE), m(ESCAPE), ...ZONES.map((_, z) => m(WOUND, z)), ...KINDS.flatMap((_, k) => ZONES.map((_, z) => m(TAKE + k, z)))];
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  const next: State = { ...state, last: move.to, lastExtra: move.extra, ply: state.ply + 1 },
    to = move.to;
  if (to === SHOT) {
    if (state.mode !== "clay" && state.ammo <= 0) return null;
    return { ...next, shots: state.shots + 1, ammo: Math.max(0, state.ammo - 1) };
  }
  if (state.mode === "bb") {
    if (to === DONE) return { ...next, winner: 0 };
    const points = to - HIT;
    if (!Number.isInteger(points) || points < 1 || points > MOST) return null;
    const combo = Math.max(1, move.extra);
    return { ...next, score: state.score + points, hits: state.hits + 1, combo, best: Math.max(state.best, combo) };
  }
  if (state.mode === "clay") {
    if (to === LAUNCH) return state.thrown >= CLAYS ? null : { ...next, thrown: state.thrown + 1 };
    if (to !== LOST && to !== BREAK) return null;
    if (to === BREAK && move.extra !== 1 && move.extra !== 2) return null;
    if (state.card.length >= state.thrown) return null;
    const card = [...state.card, to === BREAK ? move.extra : 0],
      score = card.filter((r) => r > 0).length;
    return { ...next, card, score, hits: score, winner: card.length >= CLAYS ? 0 : null };
  }
  if (to === TICK) return { ...next, left: Math.max(0, state.left - 1), winner: state.left <= 1 ? 0 : null };
  if (to === DONE) return { ...next, winner: 0 };
  if (to === ESCAPE) return { ...next, escaped: state.escaped + 1 };
  if (to === WOUND) return move.extra >= 0 && move.extra < ZONES.length ? { ...next, hits: state.hits + 1 } : null;
  const kind = to - TAKE;
  if (!Number.isInteger(kind) || kind < 0 || kind >= KINDS.length || move.extra < 0 || move.extra >= ZONES.length) return null;
  const bag = state.bag.slice();
  bag[kind]++;
  return { ...next, bag, hits: state.hits + 1, score: state.score + KINDS[kind].points };
}
/** What was taken, in words: "청둥오리 2, 사슴 1". */
export const bagWords = (state: State) =>
  KINDS.map((k, i) => (state.bag[i] ? `${k.name} ${state.bag[i]}` : ""))
    .filter(Boolean)
    .join(", ");
const rate = (state: State) => (state.shots ? Math.round((state.hits / state.shots) * 100) : 0);
export function hint(state: State): string {
  if (state.mode === "bb") {
    if (!state.shots) return `${tierOf(state.tier).name} 등급 · 화면을 누르고 있으면 조준, 가늠자와 가늠쇠가 일직선일 때 떼면 쏩니다.`;
    return `점수 ${state.score} · 남은 BB탄 ${state.ammo}발`;
  }
  if (state.mode === "clay") {
    if (!state.thrown) return "곧 접시가 날아갑니다. 누르고 있으면 조준, 떼면 쏩니다.";
    return `${Math.min(CLAYS, state.thrown)}/${CLAYS}번째 접시 · 깨뜨린 접시 ${broken(state)}개`;
  }
  if (!state.shots && state.left === SESSION) return "동물이 나타나면 누르고 있다가 가늠자와 가늠쇠가 일직선일 때 떼세요.";
  return `남은 시간 ${state.left}초 · 탄 ${state.ammo}발 · ${state.score}점`;
}
export function reason(state: State): string {
  if (state.mode === "bb")
    return `${state.score}점! ${tierOf(state.tier).name} 등급 BB탄 ${state.shots}발 가운데 ${state.hits}발을 불 켜진 과녁에 맞혔고 최고 콤보는 ${state.best}입니다 (콤보 시간 ${COMBO}초).`;
  if (state.mode === "clay") {
    const first = state.card.filter((r) => r === 1).length;
    return `${CLAYS}개 가운데 ${broken(state)}개 명중! 첫 발에 ${first}개, 둘째 발에 ${broken(state) - first}개를 깨뜨렸습니다 (${state.shots}발).`;
  }
  const bag = bagWords(state);
  return `${state.score}점! ${bag ? `${bag}을(를) 잡았습니다` : "아무것도 잡지 못했습니다"}. ${state.shots}발을 쏴 ${state.hits}발 맞혔습니다 (명중률 ${rate(state)}%).`;
}
export function tally(state: State): [string, string] {
  if (state.mode === "bb") return [`점수 ${state.score} · 남은 BB탄 ${state.ammo}발 · 명중 ${state.hits}/${state.shots} · 최고 콤보 ${state.best}`, ""];
  if (state.mode === "clay") return [`접시 ${state.thrown}/${CLAYS} · 깨뜨림 ${broken(state)}`, ""];
  return [`점수 ${state.score} · 남은 시간 ${state.left}초 · 남은 탄 ${state.ammo}발${bagWords(state) ? ` · ${bagWords(state)}` : ""}`, ""];
}
export const zoneName = (z: number) => ZONE_NAME[ZONES[z]] ?? "";
const effect = (): Effect | null => null;
export const shooting: PointGame<State> = {
  create: (variant, options) => createGame(variant, options),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.score,
  hint,
  tally,
  reason,
};
