/**
 * The two-camp waiting room of 축구 (양 진영 대기실, the user asked), free of the page: who stands in the red team, who in
 * the blue, and who waits in the middle without playing. At one screen a row is 나, 2P (a second person at the same
 * keyboard) or 컴퓨터; a person not on a team waits. Each team holds up to `CAP` (3 in 평면 축구, 2 in 중력 축구); the
 * teams may be uneven, but each needs someone. Over Wi-Fi the room's seats play this part (`teamOfSeat`).
 */
export type Mode = "flat" | "gravity";
export type Team = 0 | 1;
export type Who = "me" | "p2" | "cpu";
export const MODES: Mode[] = ["flat", "gravity"];
export const MODE_NAMES: Record<Mode, string> = { flat: "평면 축구", gravity: "중력 축구" };
/** The most players a team holds, by mode (the user asked: 3 대 3 and 2 대 2). */
export const CAP: Record<Mode, number> = { flat: 3, gravity: 2 };
export const TEAM_NAMES = ["레드", "블루"] as const;
export const TEAM_COLORS: [string, string] = ["#e3343a", "#2b6fe3"];
export const modeOf = (variant: string): Mode => (variant === "gravity" ? "gravity" : "flat");
export interface Roster {
  teams: [Who[], Who[]];
}
const LETTER: Record<Who, string> = { me: "M", p2: "P", cpu: "C" };
const WHO: Record<string, Who> = { M: "me", P: "p2", C: "cpu" };
/** The usual start: me in red against one computer in blue. */
export const DEFAULT_ROSTER = "M|C";
/** A roster as the setup keeps it: each team's rows as letters (M 나, P 2P, C 컴퓨터), the teams split by "|". */
export const writeRoster = (r: Roster) => r.teams.map((t) => t.map((w) => LETTER[w]).join("")).join("|");
/**
 * A roster read back, made legal for `mode`: unknown letters dropped, 나 and 2P at most once, each team cut to the cap
 * (a person who does not fit waits). Anything unreadable is the usual start.
 */
export function readRoster(text: unknown, mode: Mode): Roster {
  const parts = typeof text === "string" ? text.split("|") : [];
  if (parts.length !== 2) return readRoster(DEFAULT_ROSTER, mode);
  const seen = new Set<Who>(),
    teams: [Who[], Who[]] = [[], []];
  parts.forEach((part, t) => {
    for (const c of part) {
      const who = WHO[c];
      if (!who || (who !== "cpu" && seen.has(who)) || teams[t].length >= CAP[mode]) continue;
      seen.add(who);
      teams[t].push(who);
    }
  });
  return { teams };
}
/** The people at this screen who wait (are on no team). */
export const waiting = (r: Roster, people: Who[] = ["me", "p2"]) => people.filter((p) => !r.teams.some((t) => t.includes(p)));
/** Why the match cannot begin with these teams, or null. */
export function rosterProblem(r: Roster, mode: Mode): string | null {
  if (r.teams.some((t) => t.length > CAP[mode])) return `한 팀은 ${CAP[mode]}명까지입니다.`;
  const empty = r.teams.findIndex((t) => !t.length);
  if (empty >= 0) return `${TEAM_NAMES[empty]} 팀에 한 명 이상 있어야 합니다.`;
  return null;
}
/** Where a row stands: a team and its place there, or the waiting list (`team` null) for a person. */
export interface Place {
  team: Team | null;
  index: number;
  who: Who;
}
/**
 * The row at `from` moved to `to` (a team, or null: the waiting list). A person moved to the waiting list waits; a
 * computer moved there is taken away. A full team takes nobody more (null is returned: nothing changes).
 */
export function moveRow(r: Roster, from: Place, to: Team | null, mode: Mode): Roster | null {
  const teams: [Who[], Who[]] = [[...r.teams[0]], [...r.teams[1]]];
  if (from.team !== null) {
    if (teams[from.team][from.index] !== from.who) return null;
    if (to === from.team) return r;
  } else if (from.who === "cpu" || r.teams.some((t) => t.includes(from.who))) return null;
  if (to !== null && teams[to].length >= CAP[mode]) return null;
  if (from.team !== null) teams[from.team].splice(from.index, 1);
  if (to !== null) teams[to].push(from.who);
  return { teams };
}
/** A computer added to a team that has room (null: it is full). */
export function addComputer(r: Roster, team: Team, mode: Mode): Roster | null {
  if (r.teams[team].length >= CAP[mode]) return null;
  const teams: [Who[], Who[]] = [[...r.teams[0]], [...r.teams[1]]];
  teams[team].push("cpu");
  return { teams };
}
/**
 * How the screen plays it: "ai" when every person on a team is on one side (alone, or 나 and 2P together against
 * the computer), "local" when people stand on both sides or nobody plays at all (the computer against itself).
 */
export function playMode(r: Roster): "ai" | "local" {
  const sides = r.teams.map((t) => t.some((w) => w !== "cpu"));
  return sides[0] !== sides[1] ? "ai" : "local";
}
/** The team the screen's result is told for: the one 나 plays in (or 2P's), else red. */
export function homeTeam(r: Roster): Team {
  for (const who of ["me", "p2"] as Who[]) {
    const t = r.teams.findIndex((team) => team.includes(who));
    if (t >= 0) return t as Team;
  }
  return 0;
}
// ── Over Wi-Fi the seats are the slots: red 1, blue 1, red 2, blue 2, … so that people coming in fill the teams in turn. ──
export const seatCount = (mode: Mode) => CAP[mode] * 2;
export const teamOfSeat = (seat: number): Team => (seat % 2) as Team;
export const slotOfSeat = (seat: number) => Math.floor(seat / 2);
export const seatLabel = (seat: number) => `${TEAM_NAMES[teamOfSeat(seat)]} ${slotOfSeat(seat) + 1}`;
