import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOST_ONLY } from "../../net/match";
import { GOALS, foosball, type State } from "./rules";
import { FOOSBALL_COLORS, FoosballView } from "./view";

export const foosballConfig: PointConfig<State> = {
  game: foosball,
  panel: "scoreboard",
  // A goal, by either side, is told across the table.
  cheer: (before, state) => (state.ply > before.ply && (state.score[0] !== before.score[0] || state.score[1] !== before.score[1]) ? "GOAL" : null),
  tallyHtml: (state) => [0, 1].map((p) => `${state.score[p]}`) as [string, string],
  view: (host, quality, _variant, _mode, level, _net, live) => new FoosballView(host, quality, level, live),
  // Over Wi-Fi (와이파이 여럿이) two devices play four rods each, the table run by the host's (`src/net/live.ts`); a goal
  // is the host's move alone. A dropped player's rods are the host's computer's until they come back.
  net: {
    seats: () => (["빨강", "노랑"] as const).map((label, p) => ({ label, color: FOOSBALL_COLORS[p], kinds: ["computer"] })),
    toMove: () => HOST_ONLY,
    hint: (s, seat) =>
      `${s.score[0]} 대 ${s.score[1]}. ${seat === 0 || seat === 1 ? `내 막대는 ${seat === 0 ? "빨강" : "노랑"}입니다. 막대를 위아래로 움직이고, 눌러서 공을 차세요.` : "구경하는 중입니다."}`,
  },
  colors: FOOSBALL_COLORS,
  computerOnly: true,
  // The table runs in real time (a goal is never refused for the screen being busy); over Wi-Fi it is streamed (`live.ts`).
  live: true,
  pausable: true,
  noUndo: true,
  contact: (sound) => sound.plastic(),
  name: "테이블 사커",
  english: "Table Soccer",
  number: "NO. 34 — RODS AND A BALL",
  intro: `<p>펍 구석의 막대 축구대.<br>막대에 꿰인 선수들을 앞뒤로 밀고 돌려 차서 공을 상대 골문에 넣으세요.</p>`,
  meta: "컴퓨터 대전 · 와이파이 여럿이 · 막대 8줄 · 선수 22명",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FIRST TO ${GOALS}</span>`,
  artClass: "foosball-art",
  artLabel: "테이블 사커 축구대 미리보기",
  tableLabel: "THE PUB FOOSBALL",
  tableNote: () => `실시간 · ${GOALS}골 선승`,
  firstNote: "내가 빨강으로 왼쪽 골문을 지키고 오른쪽으로 공격합니다.",
  rulesTitle: `막대를 밀고 돌려 ${GOALS}골을 먼저 넣으세요`,
  rules:
    part("기본 규칙", steps("축구대에는 막대가 여덟 줄 있습니다. <b>빨강 네 줄</b>이 내 것이고 <b>노랑 네 줄</b>이 컴퓨터의 것입니다.", "나는 <b>왼쪽 골문</b>을 지키고 <b>오른쪽 골문</b>으로 공격합니다.", "공은 한가운데에서 굴러 나오고, 경기는 차례 없이 <b>실시간</b>으로 이어집니다.", "공이 골문 안으로 완전히 들어가면 한 골입니다. 골을 내준 쪽으로 공이 다시 나옵니다.", `<b>${GOALS}골</b>을 먼저 넣은 쪽이 이깁니다.`)) +
    part("막대와 선수", table(["골키퍼", "골문 바로 앞의 한 명. 골문 너비만큼만 움직입니다."], ["수비", "두 명. 골키퍼 앞을 막습니다."], ["미드필더", "다섯 명. 가운데에서 공을 끊고 앞으로 보냅니다."], ["공격", "세 명. 상대 골문 앞에서 슛을 합니다."])) +
    part("와이파이 여럿이", table(["함께 하기", "같은 와이파이의 두 기기가 막대 네 줄씩을 잡습니다. 방장이 빨강, 들어온 사람이 노랑이고, 저마다 자기 골문이 왼쪽에 오도록 축구대를 봅니다."], ["일시정지", "한 사람이 멈추면 두 기기 모두 멈추고, 누구든 다시 누르면 이어집니다."], ["연결이 끊기면", "끊긴 사람의 막대는 다시 들어올 때까지 방장 기기의 컴퓨터가 잡습니다."])) +
    part("다루는 법", table(["밀기", "마우스를 위아래로 움직이거나 손가락을 댄 채 위아래로 끌면 내 막대 네 줄이 함께 따라옵니다. 키보드는 ↑ ↓."], ["차기", "누르면(터치는 톡 치면) 선수들이 발을 뒤로 뺐다가 앞으로 휘두릅니다. 키보드는 스페이스."], ["막기", "차지 않아도 서 있는 선수의 발에 공이 맞고 튕깁니다."])) +
    part("화면", table(["구슬", "골문 위 철사의 구슬 다섯 개. 넣은 골만큼 한쪽으로 넘어갑니다."], ["멈춘 공", "아무도 닿지 못하는 곳에 공이 서면 잠시 뒤 저절로 다시 굴러 나옵니다."], ["옆 패널", "두 쪽의 골 수가 나옵니다."])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다. 화면이 어두워집니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누르면 멈춘 자리에서 이어집니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("공이 발 바로 앞에 왔을 때 차야 힘이 실립니다. 너무 일찍 차면 헛발질이 됩니다.", "막대를 움직이면서 차면 공이 비스듬히 나갑니다. 골키퍼를 피하는 방법입니다.", "수비할 때는 차기보다 공과 골문 사이에 선수를 세우는 것이 먼저입니다.", "내 막대가 모두 함께 움직이므로, 공에 가장 가까운 줄의 선수를 기준으로 맞춥니다.")),
  help: "마우스: 위아래로 움직여 밀고, 눌러서 찹니다<br>터치: 위아래로 끌어 밀고, 톡 쳐서 찹니다<br>키보드: ↑ ↓ 로 밀고 스페이스로 찹니다",
  sides: ["빨강", "노랑"],
  startWord: "손잡이를 잡기",
};
