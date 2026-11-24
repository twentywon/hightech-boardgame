import { difficulties, difficultyLabels, type Difficulty } from "../../core/ai";
import type { Effect, GameOptions, Move, PointGame, Winner } from "../points/types";
import { MODE_NAMES, TEAM_NAMES, homeTeam, modeOf, readRoster, rosterProblem, seatLabel, slotOfSeat, teamOfSeat, type Mode, type Team, type Who } from "./roster";

/**
 * A match of 축구: the pitch itself is played in real time by the view (`sim.ts`); what is a move is what the match
 * reports: a goal for a team (`GOAL + team`) and the clock run out (`TIME`). A goal ends the match at the score limit,
 * or in golden-goal overtime; the clock's end ends it with the score as it stands, or, at a tie, begins that overtime.
 *
 * Side 0 of the screen is the home team: the one 나 plays in (red when nobody at the screen plays), so that 승리 and
 * 패배 are told for the person at the screen; over Wi-Fi every device keeps red as side 0 and each seat hears its own
 * team's result (`config.ts`, `outcome`).
 */
export const GOAL = 0,
  TIME = 10;
export const GOAL_CHOICES = [1, 3, 5, 7, 0];
export const MINUTE_CHOICES = [1, 3, 5, 0];
export const DEFAULT_GOALS = 3,
  DEFAULT_MINUTES = 3;
export interface Player {
  team: Team;
  /** Who plays it at one screen (나, 2P, the computer); over Wi-Fi "seat": the room's `seat` says. */
  who: Who | "seat";
  seat: number;
}
export interface State {
  mode: Mode;
  players: Player[];
  score: [number, number];
  /** The score limit (0: none) and the clock's (minutes; 0: none). */
  goals: number;
  minutes: number;
  /** How the computer plays (the five levels of the shared picker). */
  level: Difficulty;
  overtime: boolean;
  /** The team side 0 stands for. */
  home: Team;
  /** The team that won, once it is over. */
  champion: Team | null;
  /** The team that scored last. */
  last: Team | null;
  /** Over Wi-Fi: the players are the room's seats. */
  net?: boolean;
  ply: number;
}
const choice = (value: unknown, choices: number[], fallback: number) => {
  const n = Number(value);
  return choices.includes(n) ? n : fallback;
};
/** The limits as the setup has them: never both open-ended (a match must be able to end). */
function limits(options: GameOptions) {
  const goals = choice(options.goals, GOAL_CHOICES, DEFAULT_GOALS),
    minutes = choice(options.minutes, MINUTE_CHOICES, DEFAULT_MINUTES);
  return { goals: goals || minutes ? goals : DEFAULT_GOALS, minutes };
}
/** The computer's level over Wi-Fi (와이파이 여럿이). */
export const NET_LEVEL: Difficulty = "hard";
export const levelOf = (value: unknown): Difficulty => (difficulties.includes(value as Difficulty) ? (value as Difficulty) : "normal");
const base = (mode: Mode, players: Player[], options: GameOptions, home: Team): State => ({
  mode,
  players,
  score: [0, 0],
  ...limits(options),
  level: levelOf(options.level),
  overtime: false,
  home,
  champion: null,
  last: null,
  ply: 0,
});
/** A match at one screen: the waiting room's teams (`options.roster`), its limits and the computer's level. */
export function createGame(variant: string, options: GameOptions = {}): State {
  const mode = modeOf(variant),
    roster = readRoster(options.roster, mode);
  // A team left empty (an old or broken setting) gets a computer, so that a match can always be played.
  if (rosterProblem(roster, mode)) roster.teams.forEach((t) => t.length || t.push("cpu"));
  const players: Player[] = [];
  roster.teams.forEach((t, team) => t.forEach((who) => players.push({ team: team as Team, who, seat: -1 })));
  return base(mode, players, options, homeTeam(roster));
}
/** Over Wi-Fi: a player for every seat a person or the computer took (red 1, blue 1, red 2, …), on its seat's team. */
export function createNet(variant: string, options: GameOptions, seated: boolean[]): State {
  const mode = modeOf(variant),
    players: Player[] = [];
  seated.forEach((on, seat) => {
    if (on) players.push({ team: teamOfSeat(seat), who: "seat", seat });
  });
  // Red first, then blue, each in its seats' order.
  players.sort((a, b) => a.team - b.team || a.seat - b.seat);
  // The room's computer players always play the 어려움 game (the user asked): the room has no level to pick.
  return { ...base(mode, players, options, 0), level: NET_LEVEL, net: true };
}
/** Who stands for a player, in a word: 나, 2P, 컴퓨터, or over Wi-Fi its seat (레드 1). */
export function playerName(state: State, k: number) {
  const p = state.players[k];
  if (!p) return "";
  if (p.who === "seat") return seatLabel(p.seat);
  return p.who === "me" ? "나" : p.who === "p2" ? "2P" : "컴퓨터";
}
/** A player's number on its shirt: its place in its team. */
export function shirtOf(state: State, k: number) {
  const p = state.players[k];
  if (p.who === "seat") return slotOfSeat(p.seat) + 1;
  return state.players.slice(0, k).filter((q) => q.team === p.team).length + 1;
}
/** The team a side of the screen stands for. */
export const teamOfSide = (state: State, side: number): Team => (side === 0 ? state.home : ((1 - state.home) as Team));
const tool = (to: number): Move => ({ from: -1, to, extra: -1 });
export function moves(state: State): Move[] {
  if (state.champion !== null) return [];
  return [tool(GOAL), tool(GOAL + 1), ...(state.minutes && !state.overtime ? [tool(TIME)] : [])];
}
export function play(state: State, move: Move): State | null {
  if (state.champion !== null || move.from !== -1 || move.extra !== -1) return null;
  if (move.to === TIME) {
    if (!state.minutes || state.overtime) return null;
    const [a, b] = state.score;
    return a === b ? { ...state, overtime: true, ply: state.ply + 1 } : { ...state, champion: a > b ? 0 : 1, ply: state.ply + 1 };
  }
  if (move.to !== GOAL && move.to !== GOAL + 1) return null;
  const team = (move.to - GOAL) as Team,
    score: [number, number] = [state.score[0], state.score[1]];
  score[team]++;
  const over = state.overtime || (state.goals > 0 && score[team] >= state.goals);
  return { ...state, score, last: team, champion: over ? team : null, ply: state.ply + 1 };
}
/** The limits in words: 3골 먼저 · 3분. */
export function limitText(state: Pick<State, "goals" | "minutes">) {
  return [state.goals ? `${state.goals}골 먼저` : "", state.minutes ? `${state.minutes}분` : ""].filter(Boolean).join(" · ");
}
/** How many play on each team: 3 대 2. */
export const lineup = (state: State) => `${state.players.filter((p) => p.team === 0).length} 대 ${state.players.filter((p) => p.team === 1).length}`;
const effect = (): Effect | null => null;
export const soccer: PointGame<State> = {
  create: (variant, options) => createGame(variant, options),
  moves,
  play,
  // Nobody takes turns: everyone plays at once (the computer's players are run by the view's pitch).
  turn: () => 0,
  winner: (s): Winner => (s.champion === null ? null : s.champion === s.home ? 0 : 1),
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => {
    const team = teamOfSide(s, player);
    return s.score[team] - s.score[1 - team];
  },
  hint: (s) => `레드 ${s.score[0]} 대 ${s.score[1]} 블루${s.overtime ? " · 연장 골든골" : ""}. 공에 다가가 차기를 눌러 상대 골문에 넣으세요.`,
  tally: (s) => [0, 1].map((side) => {
    const team = teamOfSide(s, side);
    return `${TEAM_NAMES[team]} ${s.score[team]}골`;
  }) as [string, string],
  // The result first (the screen puts who won before it), then how it was played.
  reason: (s) => {
    const c = s.champion ?? 0,
      won = s.score[c],
      lost = s.score[1 - c];
    return `${TEAM_NAMES[c]} 팀이 ${won} 대 ${lost}${/[036]$/.test(String(lost)) ? "으로" : "로"} 이겼습니다. ${MODE_NAMES[s.mode]} ${lineup(s)}${s.overtime ? ", 연장 골든골" : ""} · ${limitText(s)} · 컴퓨터 ${difficultyLabels[s.level]}.`;
  },
};
