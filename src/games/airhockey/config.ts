import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { GOALS, airHockey, type State } from "./rules";
import { AIRHOCKEY_COLORS, AirHockeyView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
export const airHockeyConfig: PointConfig<State> = {
  game: airHockey,
  // The goals are on the scoreboard over the table; the panel stays in the page for readers.
  noPanel: true,
  live: true,
  pausable: true,
  noUndo: true,
  computerOnly: true,
  // A goal, by either side, is told across the table.
  cheer: (before, state) => (state.ply > before.ply ? "GOAL" : null),
  tallyHtml: (state) => [0, 1].map((p) => stat("골", state.score[p])) as [string, string],
  view: (host, quality, _variant, _mode, level) => new AirHockeyView(host, quality, level),
  colors: AIRHOCKEY_COLORS,
  // The puck knocks on a mallet or a rail.
  contact: (sound) => sound.plastic(),
  name: "에어하키",
  english: "Air Hockey",
  number: "NO. 69 — FIRST TO SEVEN",
  intro: `<p>놀이공원의 에어하키 테이블 앞에 섭니다.<br>공기 위에 뜬 퍽을 말렛으로 쳐서 컴퓨터의 골문에 먼저 ${GOALS}골을 넣으세요.</p>`,
  meta: `컴퓨터 대전 · ${GOALS}골 선승 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FIRST TO ${GOALS}</span>`,
  artClass: "foosball-art",
  artLabel: "에어하키 테이블 미리보기",
  tableLabel: "THE AIR HOCKEY TABLE",
  tableNote: () => `실시간 · ${GOALS}골 선승`,
  firstNote: "내가 빨간 말렛으로 앞쪽 골문을 지키고 저 끝 골문으로 공격합니다.",
  rulesTitle: `퍽을 쳐서 ${GOALS}골을 먼저 넣으세요`,
  rules:
    part("기본 규칙", steps("테이블 표면에서 공기가 나와 <b>퍽</b>이 거의 미끄러지듯 움직입니다.", "나는 앞쪽(빨간 말렛), 컴퓨터는 저 끝(파란 말렛)입니다. 말렛은 <b>자기 쪽 절반</b>에서만 움직입니다.", "퍽이 상대 쪽 끝의 <b>골문 틈</b>으로 들어가면 한 골입니다. 골을 내준 쪽 진영에 퍽이 다시 놓입니다.", `<b>${GOALS}골</b>을 먼저 넣으면 이깁니다.`)) +
    part("치기", table(["말렛 움직이기", "마우스는 테이블 위로 움직이기만 하면 말렛이 따라옵니다. 터치는 손가락을 댄 채 끌고, 키보드는 방향키입니다."], ["세게 치기", "말렛을 빠르게 움직이며 부딪칠수록 퍽이 세게 나갑니다. 가만히 대고 있으면 막기만 합니다."], ["벽 맞히기", "퍽은 옆 레일에 맞고 튕겨 나옵니다. 비스듬히 쳐서 레일을 맞히면 상대가 막기 어렵습니다."])) +
    part("레벨", table(["쉬움", "컴퓨터의 말렛이 느리고 자주 엉뚱한 곳을 노립니다."], ["보통", "알맞은 빠르기로 막고 칩니다."], ["어려움", "빠르게 반응하고 정확히 노립니다."])) +
    part("처음이라면", notes("퍽이 내 쪽으로 오면 먼저 골문 앞을 막고, 퍽이 느려졌을 때 칩니다.", "퍽의 바로 뒤에서 상대 골문 쪽으로 밀어내듯 치면 곧게 나갑니다.", "공격한 뒤에는 말렛을 얼른 골문 앞으로 되돌립니다.")),
  help: "마우스: 테이블 위로 움직이면 말렛이 따라옵니다<br>터치: 끌어서 움직입니다<br>키보드: 방향키",
  sides: ["빨강", "파랑"],
  startWord: "말렛을 잡기",
};
