import type { Effect, GameOptions, Move, PointGame, Winner } from "../points/types";

/**
 * A round of 땅따먹기 (the user asked): two to four movers on one field, played in real time by the view (`sim.ts`).
 * What is a move is what the round reports: a mover put out (`OUT + mover`, its `extra` who put it out, -1 for its
 * own doing) and the round closed (`END`, its `extra` the finishing order — each mover's number plus one as a digit of
 * base 5, first place lowest — and each mover's share of the field in tenths of a percent, ten bits apiece, above
 * it). Against the computer mover 0 is mine; over Wi-Fi every mover is a seat's (the room says who drives it).
 */
export const OUT = 0,
  END = 10;
/**
 * The rounds (the variants; the user asked for 3분판, 5분판 and 데스매치): a timed round's seconds, or `DEATHMATCH`
 * (0 seconds: no clock, no coming back, the last one left wins). An older 1- or 2-minute choice plays the 3-minute round.
 */
export const ROUNDS = [180, 300];
export const DEFAULT_ROUND = 180,
  DEATHMATCH = 0;
export const MODES: { value: string; label: string }[] = [
  { value: "180", label: "3분판" },
  { value: "300", label: "5분판" },
  { value: "death", label: "데스매치" },
];
/** A variant's seconds: a timed round's, or 0 for the deathmatch. */
export const secondsOf = (variant: string) => (variant === "death" ? DEATHMATCH : Number(variant) || DEFAULT_ROUND);
/** The movers' colours and names, seat by seat. */
export const COLORS = ["#e5483d", "#2f7fe2", "#f0b62a", "#2ea55e"];
export const COLOR_NAMES = ["빨강", "파랑", "노랑", "초록"];
export interface State {
  /** The round's length (0: a deathmatch). */
  seconds: number;
  movers: number;
  /** How many movers people drive: 1 against the computer; over Wi-Fi every one (the room says who). */
  people: number;
  /** Over Wi-Fi the room's seat of each mover (the seats nobody closed, in order); left out elsewhere: mover k is seat k. */
  seats?: number[];
  /** How many times each mover was put out, and how many others each put out. */
  outs: number[];
  kos: number[];
  /** The finishing order and the shares of the field (0 to 1) once the round is closed. */
  ranking: number[] | null;
  shares: number[] | null;
  winner: Winner;
  ply: number;
}
export function createGame(seconds: number, movers: number, people = 1): State {
  const n = Math.max(2, Math.min(4, Math.round(movers)));
  return {
    seconds: seconds === DEATHMATCH || ROUNDS.includes(seconds) ? seconds : DEFAULT_ROUND,
    movers: n,
    people: Math.max(1, Math.min(n, people)),
    outs: Array(n).fill(0),
    kos: Array(n).fill(0),
    ranking: null,
    shares: null,
    winner: null,
    ply: 0,
  };
}
/** Against the computer: `computers` computers beside me (1 to 3). */
export const createFromOptions = (variant: string, options: GameOptions = {}) => createGame(secondsOf(variant), 1 + (Number(options.computers) || 3), 1);
/** Over Wi-Fi: a mover for every seat a person or the computer took, in seat order. */
export function createNet(variant: string, seated: boolean[]): State {
  const seats = seated.map((on, k) => (on ? k : -1)).filter((k) => k >= 0).slice(0, 4);
  return { ...createGame(secondsOf(variant), seats.length, seats.length), seats };
}
export const seatOfMover = (state: State, k: number) => state.seats?.[k] ?? k;
/** What a mover is called: against the computer 나 and 컴퓨터 1, 2, 3; over Wi-Fi its seat's colour. */
export const moverName = (state: State, k: number) => (state.seats ? COLOR_NAMES[seatOfMover(state, k)] : k === 0 ? "나" : `컴퓨터 ${k}`);
const PLACE = 5,
  SHARE = 1024;
/** The `END` move's `extra`: the order and the shares packed. */
export function packEnd(ranking: number[], shares: number[]) {
  const order = ranking.reduceRight((n, k) => n * PLACE + k + 1, 0);
  let parts = 0;
  for (let k = shares.length - 1; k >= 0; k--) parts = parts * SHARE + Math.max(0, Math.min(1000, Math.round(shares[k] * 1000)));
  return order + PLACE ** 4 * parts;
}
export function unpackEnd(extra: number, movers: number) {
  let order = extra % PLACE ** 4,
    parts = Math.floor(extra / PLACE ** 4);
  const ranking: number[] = [],
    shares: number[] = [];
  for (; order > 0; order = Math.floor(order / PLACE)) ranking.push((order % PLACE) - 1);
  for (let k = 0; k < movers; k++, parts = Math.floor(parts / SHARE)) shares.push((parts % SHARE) / 1000);
  return { ranking, shares };
}
const tool = (to: number, extra = -1): Move => ({ from: -1, to, extra });
export function moves(state: State): Move[] {
  if (state.ranking) return [];
  return Array.from({ length: state.movers }, (_, k) => tool(OUT + k));
}
export function play(state: State, move: Move): State | null {
  if (state.ranking || move.from !== -1 || !Number.isInteger(move.extra)) return null;
  if (move.to === END) {
    const { ranking, shares } = unpackEnd(move.extra, state.movers);
    if (ranking.length !== state.movers || new Set(ranking).size !== state.movers || ranking.some((k) => k < 0 || k >= state.movers)) return null;
    if (shares.reduce((a, b) => a + b, 0) > 1.001) return null;
    // Against the computer I win only from first place; over Wi-Fi the room names the winner's seat.
    const winner: Winner = state.people > 1 ? 0 : ranking[0] === 0 ? 0 : 1;
    return { ...state, ranking, shares, winner, ply: state.ply + 1 };
  }
  const k = move.to - OUT;
  if (k < 0 || k >= state.movers || move.extra < -1 || move.extra >= state.movers) return null;
  const outs = [...state.outs],
    kos = [...state.kos];
  outs[k]++;
  if (move.extra >= 0 && move.extra !== k) kos[move.extra]++;
  return { ...state, outs, kos, ply: state.ply + 1 };
}
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
const effect = (): Effect | null => null;
export const territory: PointGame<State> = {
  create: (variant, options) => createFromOptions(variant, options),
  moves,
  play,
  // Nobody takes turns: every mover runs at once (the computer's are run by the view's round).
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => (player === 0 ? 1 : -1) * (s.kos[0] - s.outs[0]),
  hint: () => "내 땅 밖으로 나가면 꼬리가 남습니다. 꼬리를 끌고 내 땅으로 돌아오면 꼬리가 둘러싼 곳이 모두 내 땅이 됩니다.",
  tally: (s) => {
    const line = (k: number) => `${moverName(s, k)}${s.shares ? ` ${percent(s.shares[k])}` : ""}${s.outs[k] ? ` · 탈락 ${s.outs[k]}` : ""}`;
    return s.people > 1 ? [Array.from({ length: s.movers }, (_, k) => line(k)).join(", "), ""] : [line(0), Array.from({ length: s.movers - 1 }, (_, k) => line(k + 1)).join(", ")];
  },
  reason: (s) => {
    if (!s.ranking || !s.shares) return "";
    const shares = s.shares;
    const why =
      shares[s.ranking[0]] >= 0.5 ? "땅의 절반을 먼저 차지했습니다." : s.seconds === DEATHMATCH ? "마지막까지 살아남은 쪽이 이깁니다." : "시간이 끝났을 때 땅이 가장 넓은 쪽이 이깁니다.";
    return `${s.ranking.map((k, i) => `${i + 1}위 ${moverName(s, k)} ${percent(shares[k])}`).join(" · ")}. ${why}`;
  },
};
