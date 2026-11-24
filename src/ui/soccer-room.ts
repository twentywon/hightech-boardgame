import { difficulties, difficultyLabels, type Difficulty } from "../core/ai";
import { DEFAULT_GOALS, DEFAULT_MINUTES, GOAL_CHOICES, MINUTE_CHOICES, levelOf } from "../games/soccer/rules";
import {
  CAP,
  MODES,
  MODE_NAMES,
  TEAM_NAMES,
  addComputer,
  modeOf,
  moveRow,
  playMode,
  readRoster,
  rosterProblem,
  waiting,
  writeRoster,
  type Mode,
  type Place,
  type Roster,
  type Team,
  type Who,
} from "../games/soccer/roster";
import type { PointOptions } from "./point-game";

/**
 * 축구's setup window, the two-camp waiting room (양 진영 대기실, the user asked, after a picture they sent): a dark
 * panel with the room's title at its upper left and the Wi-Fi room's button at its upper right; three columns, 레드,
 * 관전 · 대기 and 블루, each a list of rows (나 in gold, 2P, 컴퓨터); a press on a row picks it and a press on a column's
 * head moves it there (a computer moved to the waiting list is taken away); a team's empty place takes a computer.
 * Under it the settings (경기장, 시간 제한, 점수 제한, 컴퓨터 난이도) and the start. The rules of the rows are
 * `roster.ts`; this only draws and wires them. On a phone only one person plays a device, so it has no 2P.
 */
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const WORD: Record<Who, string> = { me: "나", p2: "2P", cpu: "컴퓨터" };
/** Whether this device is held in the hand (a touch screen alone): one person a device then. */
const handheld = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
const option = (value: string | number, label: string, chosen: string | number) => `<option value="${value}" ${String(value) === String(chosen) ? "selected" : ""}>${label}</option>`;
export function soccerSetup(host: HTMLElement, preferences: PointOptions, remember: (p: PointOptions) => void, start: () => void) {
  const people: Who[] = handheld() ? ["me"] : ["me", "p2"];
  let mode: Mode = modeOf(preferences.variant),
    roster: Roster = readRoster(preferences.settings?.roster, mode),
    level: Difficulty = levelOf(preferences.settings?.level),
    goals = GOAL_CHOICES.includes(Number(preferences.settings?.goals)) ? Number(preferences.settings?.goals) : DEFAULT_GOALS,
    minutes = MINUTE_CHOICES.includes(Number(preferences.settings?.minutes)) ? Number(preferences.settings?.minutes) : DEFAULT_MINUTES,
    picked: Place | null = null;
  // 2P has no place on a phone.
  if (people.length === 1) roster = { teams: [roster.teams[0].filter((w) => w !== "p2"), roster.teams[1].filter((w) => w !== "p2")] };
  host.innerHTML = `<section class="so-entry featured"><div class="feature-copy"><p class="so-intro">하스볼 같은 실시간 축구. 원판 선수를 움직여 공을 차 넣으세요. <b>평면 축구</b>는 위에서 본 경기장에서 최대 3 대 3, <b>중력 축구</b>는 옆에서 본 경기장에서 점프하며 최대 2 대 2로 뜁니다.</p><div class="so-room"><div class="so-room-top"><div class="so-room-title"><b>축구 대기실</b><small id="so-room-sub"></small></div><div class="so-room-tools"><button type="button" id="so-wifi" class="so-tool">와이파이 방</button></div></div><div class="so-camps" id="so-camps"></div><p class="so-room-note" id="so-room-note" role="status"></p></div><div class="ai-options so-settings"><label>경기장<select id="so-mode">${MODES.map((m) => option(m, MODE_NAMES[m], mode)).join("")}</select></label><label>시간 제한<select id="so-minutes">${MINUTE_CHOICES.map((n) => option(n, n ? `${n}분` : "무제한", minutes)).join("")}</select></label><label>점수 제한<select id="so-goals">${GOAL_CHOICES.map((n) => option(n, n ? `${n}골` : "무제한", goals)).join("")}</select></label><label id="so-level-field">컴퓨터 난이도<select id="so-difficulty">${difficulties.map((d) => option(d, difficultyLabels[d], level)).join("")}</select></label></div><p class="session-note so-keys" id="so-keys"></p><button id="so-start" class="primary">킥오프 <span>↗</span></button></div></section>`;
  const $ = <E extends HTMLElement>(id: string) => host.querySelector<E>(`#${id}`)!;
  const keep = () => {
    preferences = {
      ...preferences,
      variant: mode,
      settings: { roster: writeRoster(roster), goals: String(goals), minutes: String(minutes), level },
    };
    remember({ ...preferences });
  };
  /** Where 나 stands now (picked when nothing else is). */
  const placeOf = (who: Who): Place => {
    for (const t of [0, 1] as Team[]) {
      const i = roster.teams[t].indexOf(who);
      if (i >= 0) return { team: t, index: i, who };
    }
    return { team: null, index: 0, who };
  };
  const same = (a: Place | null, b: Place) => !!a && a.team === b.team && a.index === b.index && a.who === b.who;
  function draw() {
    if (!picked || (picked.team !== null && roster.teams[picked.team][picked.index] !== picked.who)) picked = placeOf("me");
    const row = (place: Place) =>
      `<li><button type="button" class="so-row ${place.who}${same(picked, place) ? " picked" : ""}" data-team="${place.team ?? "wait"}" data-index="${place.index}" data-who="${place.who}" aria-pressed="${same(picked, place)}"><i class="so-mark" aria-hidden="true"></i><span>${WORD[place.who]}</span></button>${place.who === "cpu" ? `<button type="button" class="so-x" data-team="${place.team}" data-index="${place.index}" aria-label="${TEAM_NAMES[place.team as Team]} 컴퓨터 빼기">×</button>` : ""}</li>`;
    const camp = (team: Team | null) => {
      const rows = team === null ? waiting(roster, people).map((who) => row({ team: null, index: 0, who })) : roster.teams[team].map((who, index) => row({ team, index, who }));
      if (team !== null) for (let k = roster.teams[team].length; k < CAP[mode]; k++) rows.push(`<li class="so-empty"><button type="button" class="so-add" data-team="${team}" aria-label="빈자리에 컴퓨터 넣기">+ 컴퓨터</button></li>`);
      const name = team === null ? "관전 · 대기" : TEAM_NAMES[team],
        full = team !== null && roster.teams[team].length >= CAP[mode] && picked?.team !== team;
      return `<section class="so-camp ${team === null ? "wait" : `t${team}`}"><button type="button" class="so-camp-head" data-camp="${team ?? "wait"}" ${full ? "aria-disabled=\"true\"" : ""}>${name}${team === null ? "" : ` <small>${roster.teams[team].length}/${CAP[mode]}</small>`}</button><ul class="so-list" aria-label="${name}">${rows.join("") || `<li class="so-none">없음</li>`}</ul></section>`;
    };
    $("so-camps").innerHTML = camp(0) + camp(null) + camp(1);
    $("so-room-sub").textContent = `${MODE_NAMES[mode]} · 한 팀 최대 ${CAP[mode]}명`;
    const problem = rosterProblem(roster, mode),
      cpu = roster.teams.some((t) => t.includes("cpu"));
    $("so-room-note").textContent = problem ?? `이름을 누른 뒤 레드 · 관전 · 블루 머리를 누르면 그쪽으로 옮깁니다. 빈자리에는 컴퓨터를 넣을 수 있습니다.${people.length === 1 ? " 휴대폰에서는 한 기기에 한 사람만 뜁니다." : ""}`;
    $("so-room-note").classList.toggle("problem", !!problem);
    $<HTMLButtonElement>("so-start").disabled = !!problem;
    if ($("so-level-field").hidden !== !cpu) $("so-level-field").hidden = !cpu;
    const two = roster.teams.some((t) => t.includes("me")) && roster.teams.some((t) => t.includes("p2"));
    $("so-keys").innerHTML = mode === "flat"
      ? two
        ? "나: W A S D 이동 · 스페이스 차기 / 2P: 방향키 이동 · Enter(또는 /) 차기"
        : "방향키 또는 W A S D로 움직이고, 스페이스(또는 X)로 찹니다. 휴대폰은 조이스틱과 차기 버튼."
      : two
        ? "나: A D 이동 · W 점프 · 스페이스 차기 / 2P: ← → 이동 · ↑ 점프 · Enter(또는 /) 차기"
        : "← → (또는 A D)로 달리고 ↑(또는 W)로 점프, 스페이스(또는 X)로 찹니다. 휴대폰은 ◀ ▶ · 점프 · 차기 버튼.";
    // Both limits open-ended would never end: the other's 무제한 is not offered while one is.
    for (const [id, other] of [["so-minutes", goals], ["so-goals", minutes]] as const)
      host.querySelectorAll<HTMLOptionElement>(`#${id} option[value="0"]`).forEach((o) => {
        if (o.disabled !== (other === 0)) o.disabled = other === 0;
      });
    keep();
  }
  host.addEventListener("click", (e) => {
    const target = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!target || !host.contains(target)) return;
    const team = (v: string | undefined): Team | null => (v === "0" ? 0 : v === "1" ? 1 : null);
    if (target.classList.contains("so-row")) {
      picked = { team: team(target.dataset.team), index: Number(target.dataset.index), who: target.dataset.who as Who };
      return draw();
    }
    if (target.classList.contains("so-camp-head")) {
      const to = team(target.dataset.camp),
        from = picked ?? placeOf("me"),
        next = moveRow(roster, from, to, mode);
      if (!next) {
        $("so-room-note").textContent = to === null ? "" : `${TEAM_NAMES[to]} 팀은 ${CAP[mode]}명까지입니다.`;
        return;
      }
      roster = next;
      // The row moved stays picked where it went (a computer sent away: 나 again).
      picked = from.who === "cpu" && to === null ? null : to === null ? { team: null, index: 0, who: from.who } : { team: to, index: roster.teams[to].length - 1, who: from.who };
      return draw();
    }
    if (target.classList.contains("so-add")) {
      const t = team(target.dataset.team);
      if (t === null) return;
      roster = addComputer(roster, t, mode) ?? roster;
      return draw();
    }
    if (target.classList.contains("so-x")) {
      const t = team(target.dataset.team);
      if (t === null) return;
      roster = moveRow(roster, { team: t, index: Number(target.dataset.index), who: "cpu" }, null, mode) ?? roster;
      return draw();
    }
  });
  $<HTMLSelectElement>("so-mode").onchange = () => {
    mode = modeOf($<HTMLSelectElement>("so-mode").value);
    // A team over the new cap keeps its first places; a person who no longer fits waits.
    roster = readRoster(writeRoster(roster), mode);
    draw();
  };
  $<HTMLSelectElement>("so-minutes").onchange = () => {
    minutes = Number($<HTMLSelectElement>("so-minutes").value);
    draw();
  };
  $<HTMLSelectElement>("so-goals").onchange = () => {
    goals = Number($<HTMLSelectElement>("so-goals").value);
    draw();
  };
  $<HTMLSelectElement>("so-difficulty").onchange = () => {
    level = levelOf($<HTMLSelectElement>("so-difficulty").value);
    keep();
  };
  $("so-wifi").onclick = () => {
    // Over Wi-Fi the room's window comes in place of this one; the mode and limits chosen here are the room's.
    preferences = { ...preferences, mode: "net" };
    keep();
    const dialog = host.closest("dialog");
    dialog?.close();
    dialog?.remove();
    start();
  };
  $<HTMLButtonElement>("so-start").onclick = () => {
    if (rosterProblem(roster, mode)) return;
    preferences = { ...preferences, mode: playMode(roster) };
    keep();
    start();
  };
  draw();
}
