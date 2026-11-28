import type { Effect, GameOptions, Move, PointGame, Winner } from "../points/types";
import { COURSES, courseOf } from "./track";

/**
 * A slot car race (슬롯 카, the user asked): two to four cars, one to a lane, over a number of laps. The track itself is
 * run in real time by the view (`sim.ts`); what is a move is what the race reports: a car crossing the line (`LAP +
 * car`), a car flying off (`OFF + car`) and the race closed (`END`, its `extra` the places of every car, each car's
 * number plus one as a digit of base 5, first place lowest). Against the computer car 0 is mine and the others the
 * computer's; at one screen every car is a person's.
 */
export const LAP = 0,
  OFF = 10,
  END = 20;
export const LAP_CHOICES = [3, 5, 10];
export const DEFAULT_LAPS = 5;
/** The cars' colours and names, lane by lane. */
export const COLORS = ["#e3262e", "#1f63d8", "#f2b705", "#1f9a4a"];
export const COLOR_NAMES = ["빨강", "파랑", "노랑", "초록"];
export interface State {
  course: string;
  laps: number;
  cars: number;
  /** How many of the cars people drive (the first ones): 1 against the computer; over Wi-Fi every car (the room says who drives). */
  people: number;
  /**
   * Over Wi-Fi (와이파이 여럿이) the room's seat of each car, lane by lane (the seats nobody closed, in order); its colour,
   * number and name are the seat's. Left out elsewhere: car k is seat k.
   */
  seats?: number[];
  done: number[];
  offs: number[];
  /** The cars home, in order. */
  order: number[];
  /** Every car's place once the race is closed (first to last). */
  ranking: number[] | null;
  winner: Winner;
  ply: number;
}
export function createGame(course: string, laps: number, cars: number, people: number): State {
  const n = Math.max(2, Math.min(4, cars));
  return {
    course: courseOf(course).value,
    laps: LAP_CHOICES.includes(laps) ? laps : DEFAULT_LAPS,
    cars: n,
    people: Math.max(1, Math.min(n, people)),
    done: Array(n).fill(0),
    offs: Array(n).fill(0),
    order: [],
    ranking: null,
    winner: null,
    ply: 0,
  };
}
/** The setup's options: against the computer `computers` computers beside me, at one screen `people` people. */
export function createFromOptions(course: string, options: GameOptions = {}) {
  const laps = Number(options.laps) || DEFAULT_LAPS;
  if (options.people !== undefined) {
    const people = Number(options.people) || 2;
    return createGame(course, laps, people, people);
  }
  return createGame(course, laps, 1 + (Number(options.computers) || 3), 1);
}
/** Over Wi-Fi: a car for every seat a person or the computer took, one to a lane in seat order (`seated` by seat). */
export function createNet(course: string, options: GameOptions, seated: boolean[]): State {
  const seats = seated.map((on, k) => (on ? k : -1)).filter((k) => k >= 0).slice(0, 4);
  return { ...createGame(course, Number(options.laps) || DEFAULT_LAPS, seats.length, seats.length), seats };
}
/** The seat (colour, number) of a car: over Wi-Fi the room's, elsewhere its lane's. */
export const seatOfCar = (state: State, car: number) => state.seats?.[car] ?? car;
/** Packs a finishing order into an `END` move's `extra`, and reads it back. */
export const packRanking = (ranking: number[]) => ranking.reduceRight((n, car) => n * 5 + car + 1, 0);
export function unpackRanking(extra: number) {
  const out: number[] = [];
  for (let n = extra; n > 0; n = Math.floor(n / 5)) out.push((n % 5) - 1);
  return out;
}
const tool = (to: number, extra = -1): Move => ({ from: -1, to, extra });
export function moves(state: State): Move[] {
  if (state.ranking) return [];
  const cars = Array.from({ length: state.cars }, (_, k) => k);
  return [...cars.filter((k) => state.done[k] < state.laps).map((k) => tool(LAP + k)), ...cars.filter((k) => state.done[k] < state.laps).map((k) => tool(OFF + k))];
}
export function play(state: State, move: Move): State | null {
  if (state.ranking || move.from !== -1) return null;
  const { to } = move;
  if (to === END) {
    const ranking = unpackRanking(move.extra);
    // Every car once, those home first and in their order.
    if (ranking.length !== state.cars || new Set(ranking).size !== state.cars || ranking.some((k) => k < 0 || k >= state.cars)) return null;
    if (state.order.some((k, i) => ranking[i] !== k)) return null;
    // Against the computer I win only from first place; at one screen someone always wins (`whoOf` names them).
    const winner: Winner = state.people > 1 ? 0 : ranking[0] === 0 ? 0 : 1;
    return { ...state, ranking, winner, ply: state.ply + 1 };
  }
  const car = to >= OFF ? to - OFF : to - LAP;
  if (move.extra !== -1 || car < 0 || car >= state.cars || state.done[car] >= state.laps) return null;
  if (to >= OFF) {
    const offs = [...state.offs];
    offs[car]++;
    return { ...state, offs, ply: state.ply + 1 };
  }
  const done = [...state.done];
  done[car]++;
  return { ...state, done, order: done[car] >= state.laps ? [...state.order, car] : state.order, ply: state.ply + 1 };
}
/**
 * What a car is called: against the computer 나 and 컴퓨터 1, 2, 3; at one screen each person by number and colour; over
 * Wi-Fi by its seat's colour alone (the same words on every device; each view names its own car 나 on its board).
 */
export const carName = (state: State, car: number) =>
  state.seats ? COLOR_NAMES[seatOfCar(state, car)] : state.people > 1 ? `${car + 1}번 ${COLOR_NAMES[car]}` : car === 0 ? "나" : `컴퓨터 ${car}`;
/** The place a car stands in now: home in order, then by laps done (the view knows more and tells it on its board). */
export function standing(state: State) {
  const cars = Array.from({ length: state.cars }, (_, k) => k);
  return state.ranking ?? [...state.order, ...cars.filter((k) => !state.order.includes(k)).sort((a, b) => state.done[b] - state.done[a] || a - b)];
}
const effect = (): Effect | null => null;
export const slotCar: PointGame<State> = {
  create: (variant, options) => createFromOptions(variant || COURSES[0].value, options),
  moves,
  play,
  // Nobody takes turns: every car runs at once (the computer's drivers are run by the view's race).
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => (player === 0 ? 1 : -1) * (s.done[0] - Math.max(0, ...s.done.slice(1))),
  hint: () => "가속 페달을 누르고 있으면 빨라지고, 떼면 느려집니다. 코너에 너무 빨리 들어가면 차가 튕겨 나갑니다.",
  tally: (s) => {
    const line = (k: number) => `${carName(s, k)} ${Math.min(s.done[k], s.laps)}/${s.laps}바퀴${s.offs[k] ? ` · 이탈 ${s.offs[k]}` : ""}`;
    return s.people > 1
      ? [Array.from({ length: s.cars }, (_, k) => line(k)).join(", "), ""]
      : [line(0), Array.from({ length: s.cars - 1 }, (_, k) => line(k + 1)).join(", ")];
  },
  // The finishing order, every car by its place (a car not home is said to be so).
  reason: (s) => {
    const ranking = standing(s);
    return `${ranking.map((k, i) => `${i + 1}위 ${carName(s, k)}${s.done[k] < s.laps ? "(완주 못 함)" : ""}`).join(" · ")}. ${courseOf(s.course).name} ${s.laps}바퀴 경주였습니다.`;
  },
};
