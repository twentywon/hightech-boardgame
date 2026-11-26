import { HOST_ONLY } from "../../net/match";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { soccerSetup } from "../../ui/soccer-room";
import { CAP, MODE_NAMES, TEAM_COLORS, TEAM_NAMES, modeOf, seatCount, seatLabel, teamOfSeat } from "./roster";
import { GOAL_CHOICES, MINUTE_CHOICES, createNet, limitText, soccer, teamOfSide, type State } from "./rules";
import { BODY, FLAT, KICKOFF_WAIT, DT } from "./sim";
import { SOCCER_COLORS, SoccerView } from "./view";

const teamName = (team: 0 | 1) => `${TEAM_NAMES[team]} 팀`;
const kickoffWait = Math.round(KICKOFF_WAIT * DT);
export const soccerConfig: PointConfig<State> = {
  game: soccer,
  live: true,
  pausable: true,
  noUndo: true,
  // The scoreboard and the clock stand over the pitch (the view's own); the panel stays in the page for readers.
  noPanel: true,
  ownSetup: soccerSetup,
  view: (host, quality, variant, _mode, _level, _net, live) => new SoccerView(host, quality, variant, live),
  // Over Wi-Fi (와이파이 여럿이) one device a person, up to six (평면) or four (중력): the seats are red 1, blue 1, red 2,
  // …, so that people coming in fill the teams in turn, shown in the room's window as two camps. A seat nobody takes
  // may be the host's computer's; the rest are left out. The match is run by the host's view (`src/net/live.ts`,
  // `net.ts`): each guest sends its hand, the host tells the pitch; goals and the clock's end are the host's moves.
  net: {
    seats: (variant) => Array.from({ length: seatCount(modeOf(variant)) }, (_, seat) => ({ label: seatLabel(seat), color: TEAM_COLORS[teamOfSeat(seat)], kinds: ["computer", "closed"] })),
    create: (variant, options, seated) => createNet(variant, options, seated),
    toMove: () => HOST_ONLY,
    winnerSeat: () => null,
    outcome: (s, seat) => (s.champion === null ? "draw" : teamOfSeat(seat) === s.champion ? "win" : "lose"),
    reason: (s) => soccer.reason(s),
    hint: (s, seat) =>
      `레드 ${s.score[0]} 대 ${s.score[1]} 블루${s.overtime ? " · 연장 골든골" : ""}. ${seat === null || !s.players.some((p) => p.seat === seat) ? "구경하는 중입니다." : `나는 ${teamName(teamOfSeat(seat))}입니다.`}`,
    camps: {
      names: ["레드", "블루"],
      colors: TEAM_COLORS,
      teamOf: teamOfSeat,
      label: (seats) => {
        const per = seats.length / 2;
        return `${per >= CAP.flat ? MODE_NAMES.flat : MODE_NAMES.gravity} · 한 팀 최대 ${per}명`;
      },
      problem: (seats) => {
        for (const team of [0, 1] as const)
          if (!seats.some((s, i) => teamOfSeat(i) === team && (s.kind === "person" || s.kind === "computer"))) return `${TEAM_NAMES[team]} 팀에 한 명 이상 있어야 합니다.`;
        return null;
      },
    },
  },
  colors: SOCCER_COLORS,
  colorsOf: () => SOCCER_COLORS,
  sides: ["레드", "블루"],
  sidesOf: (_variant, state) => (state ? [TEAM_NAMES[teamOfSide(state, 0)], TEAM_NAMES[teamOfSide(state, 1)]] : ["레드", "블루"]),
  // At one screen with people on both teams (or none), the result names the team that won.
  whoOf: (s, player, mode) => (mode === "local" ? teamName(teamOfSide(s, player)) : null),
  localLabel: "한 화면",
  cheer: (before, state) => (state.score[0] + state.score[1] > before.score[0] + before.score[1] && state.champion === null ? `${TEAM_NAMES[state.last ?? 0]} 골!` : !before.overtime && state.overtime ? "연장 · 골든골" : null),
  // A kick, the ball off a board or a post, a goal's roar, the whistle, the crowd's murmur.
  knock: (sound, kind: string, strength) => {
    if (kind === "kick") sound.kickBall(strength);
    else if (kind === "bump") sound.boardKnock(strength);
    else if (kind === "post") sound.postRing(strength);
    else if (kind === "goal") sound.goalRoar();
    else if (kind === "whistle") sound.whistle(strength >= 1);
    else if (kind === "crowd") sound.crowd(strength);
  },
  movingText: "경기 중…",
  name: "축구",
  english: "Soccer",
  number: "NO. 104 — TWO PITCHES",
  intro: `<p>작은 경기장의 실시간 축구. 하스볼 같은 평면 축구와, 옆에서 보며 점프하는 중력 축구.</p>`,
  meta: "컴퓨터 대전 · 한 화면 2인 · 와이파이 여럿이 · 최대 3 대 3 · 실시간",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>TWO PITCHES</span>`,
  artClass: "foosball-art",
  artLabel: "축구 경기장 미리보기",
  tableLabel: "WORLD TABLE CUP",
  tableNote: (variant, options) => {
    const goals = Number(options.goals),
      minutes = Number(options.minutes);
    return `${MODE_NAMES[modeOf(variant)]} · ${limitText({ goals: GOAL_CHOICES.includes(goals) ? goals : 3, minutes: MINUTE_CHOICES.includes(minutes) ? minutes : 3 }) || "제한 없음"}`;
  },
  firstNote: "대기실에서 나를 레드나 블루로 옮기고, 빈자리에 컴퓨터를 넣으세요.",
  rulesTitle: "공을 차서 상대 골문에",
  rules:
    part(
      "기본 규칙",
      steps(
        "레드 팀과 블루 팀이 겨룹니다. 레드는 왼쪽 골문을 지키고 오른쪽으로, 블루는 오른쪽 골문을 지키고 왼쪽으로 공격합니다.",
        "선수는 둥근 원판입니다. 움직여서 몸으로 공을 밀거나, 공이 아주 가까울 때 <b>차기</b>를 눌러 세게 찹니다. 선수끼리도 서로 밀칩니다.",
        "공이 골대 사이로 골라인을 넘으면 1골입니다. 골을 내준 팀이 가운데에서 <b>킥오프</b>합니다.",
        `킥오프 때는 모두 자기 진영에 있어야 하고, 킥오프하지 않는 팀은 가운데 원(중력 축구는 가운데 구역)에 들어갈 수 없습니다. 누군가 공을 건드리면, 또는 ${kickoffWait}초가 지나면 풀립니다.`,
        "정한 점수를 먼저 내면 이깁니다. 시간 제한이 있으면 시간이 끝났을 때 앞선 팀이 이기고, 같으면 <b>연장 골든골</b>: 먼저 넣는 팀이 이깁니다.",
      ),
    ) +
    part(
      "경기장",
      table(
        ["평면 축구", `위에서 본 작은 경기장에서 여덟 방향으로 움직입니다. 공은 보드와 둥근 골대에 맞고 튕깁니다. 차기를 누르고 있는 동안은 조금 느려집니다. 한 팀 최대 ${CAP.flat}명.`],
        ["중력 축구", `옆에서 본 경기장. 중력이 있어 공이 떨어지고 튀어 오릅니다. 좌우로 달리고 <b>땅에서만 점프</b>할 수 있으며, 차면 공이 위로 떠오릅니다. 골문은 양 끝 땅 위에 있고, 점프해도 머리 위로 공간이 남을 만큼 높습니다. 크로스바와 골대 지붕, 양쪽 벽에 공이 튕깁니다. 천장은 없어서 공이 화면 위로 날아가면 맨 위에 그 자리와 높이가 표시됩니다. 한 팀 최대 ${CAP.gravity}명.`],
      ),
    ) +
    part(
      "대기실",
      table(
        ["세 줄", "왼쪽이 레드, 가운데가 관전 · 대기, 오른쪽이 블루입니다. 줄에 있는 사람만 뜁니다."],
        ["옮기기", "이름(나, 2P, 컴퓨터)을 누른 뒤 줄의 머리를 누르면 그 줄로 옮깁니다. 컴퓨터를 대기로 보내면 빠집니다."],
        ["컴퓨터", "빈자리의 '+ 컴퓨터'로 넣고 ×로 뺍니다. 팀 인원은 달라도 되지만(1 대 2 등) 팀마다 한 명은 있어야 합니다."],
        ["2P", "한 키보드에서 두 번째 사람이 뜁니다. 휴대폰에서는 한 기기에 한 사람만 뜁니다."],
      ),
    ) +
    part(
      "움직이기와 차기",
      table(
        ["혼자", "평면: 방향키 또는 W A S D로 이동, 스페이스(또는 X)로 차기. 중력: ← → 또는 A D로 달리기, ↑ 또는 W로 점프."],
        ["둘이서", "나는 W A S D(중력은 W가 점프)와 스페이스, 2P는 방향키(중력은 ↑가 점프)와 Enter 또는 /."],
        ["휴대폰", "왼쪽 아래 레버(조이스틱)로 움직이고 오른쪽 아래 차기 버튼으로 찹니다. 중력 축구에서는 레버를 좌우로 밀어 달리고, 위로 올리면 점프합니다."],
        ["일시정지", "오른쪽 위 버튼이나 P 키."],
      ),
    ) +
    part(
      "모드",
      table(
        ["컴퓨터 대전", "나(와 2P)와 컴퓨터가 팀을 나눠 뜁니다. 내 팀이 이기면 승리입니다."],
        ["한 화면", "나와 2P가 서로 다른 팀이면 한 화면에서 겨룹니다. 이긴 팀 이름이 나옵니다."],
        [
          "와이파이 여럿이",
          `같은 와이파이의 기기 하나에 한 사람씩, 평면은 최대 ${CAP.flat * 2}명, 중력은 최대 ${CAP.gravity * 2}명이 뜁니다. 방의 대기실에서 레드나 블루 머리를 눌러 팀에 들어갑니다. 방장이 컴퓨터 선수를 넣고 빼며, 경기장 · 시간 · 점수는 방장이 고른 대로입니다. 연결이 끊긴 사람의 선수는 돌아올 때까지 방장 기기의 컴퓨터가 뜁니다. 방장이 나가면 방이 끝납니다.`,
        ],
      ),
    ) +
    part(
      "레벨",
      table(
        ["입문 · 쉬움", "공을 늦게 보고 엉뚱한 곳을 노립니다."],
        ["보통", "알맞게 따라가고 가끔 슛합니다."],
        ["어려움 · 전문가", "빠르게 공 뒤로 돌아가 정확히 찹니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "공 바로 뒤, 상대 골문과 일직선이 되는 곳으로 먼저 가세요. 그다음 공 쪽으로 움직이며 차기를 누르면 곧게 나갑니다.",
        `차기는 공이 거의 닿을 때(${Math.round(BODY.flat.reach * 100)}cm쯤 안)만 들어갑니다. 미리 누르고 있다가 닿는 순간 나가게 해도 됩니다.`,
        "중력 축구에서는 떨어지는 공 아래로 들어가 점프하면 머리로 받을 수 있습니다.",
        `한 명은 골문 앞을 지키면 실점이 크게 줄어듭니다. 골문 폭은 ${(FLAT.GOAL * 2).toFixed(1)}칸입니다.`,
      ),
    ),
  help: "평면: 방향키/W A S D 이동 · 스페이스 차기<br>중력: ← →/A D 달리기 · ↑/W 점프 · 스페이스 차기<br>2P: 방향키 · Enter 또는 /",
  startWord: "킥오프",
};
