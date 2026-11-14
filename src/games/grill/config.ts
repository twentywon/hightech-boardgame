import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BEST, BURN, EAT, SECONDS, grill, type State } from "./rules";
import { CUTS, PORTION } from "./sim";
import { GRILL_COLORS, GrillView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`,
  TOTAL = CUTS.length * PORTION;
export const grillConfig: PointConfig<State> = {
  game: grill,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  view: (host, quality) => new GrillView(host, quality),
  colors: GRILL_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("남은 시간", `${state.left}초`) + stat("먹은 고기", `${state.eaten}/${TOTAL}`) + stat("탄 고기", state.burnt), ""],
  contact: (sound, state) => (state.last === BURN ? sound.lose() : state.last === EAT + BEST ? sound.sparkle() : state.last !== null && state.last >= EAT ? sound.hop() : sound.tap()),
  name: "고기 굽기",
  english: "Meat Grill",
  number: "NO. 47 — LAY, TURN, EAT",
  intro: `<p>숯불 화로를 가운데 둔 고깃집 식탁.<br>접시의 고기를 불판에 올리고, 알맞게 뒤집어 가며 구워 드세요.</p>`,
  meta: `1인 · 접시 ${CUTS.length}개 · ${SECONDS}초`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LAY, TURN, EAT</span>`,
  artClass: "hexa-art",
  artLabel: "고기 굽기 미리보기",
  tableLabel: "THE GRILL TABLE",
  tableNote: () => `고기 ${TOTAL}점 · ${SECONDS}초`,
  rulesTitle: "올리고, 뒤집고, 먹기",
  rules:
    part("기본 규칙", steps(`화로 양옆에 고기 접시가 ${CUTS.length}개 있고, 접시마다 ${PORTION}점씩 놓여 있습니다.`, "<b>접시를 누르면</b> 고기 한 점이 불판의 빈자리에 올라갑니다. 불판에는 일곱 점까지 올릴 수 있습니다.", "고기는 <b>불에 닿은 아래쪽 면</b>만 익습니다. <b>고기를 누르면 뒤집힙니다</b>. 몇 번이든 뒤집을 수 있습니다.", "다 익은 고기는 <b>불판 밖으로 끌어내면</b> 먹습니다. 양쪽이 잘 익었을수록 점수가 높습니다.", "너무 오래 두면 <b>탑니다</b>. 탄 고기는 그 자리를 차지한 채 남으니 끌어내 버립니다.", `<b>${SECONDS}초</b>가 지나거나 접시와 불판이 모두 비면 식사가 끝납니다. 시간이 끝났을 때 불판에 남은 고기는 점수가 없습니다.`)) +
    part("올리고 뒤집고 먹기", table(["올리기", "접시를 누르면 빈자리에 올라갑니다. 접시에서 <b>끌어다</b> 원하는 자리에 놓을 수도 있습니다."], ["뒤집기", "불판 위의 고기를 누릅니다."], ["먹기", "고기를 불판 밖으로 끌어냅니다. 고기를 <b>길게 눌렀다 떼도</b> 됩니다."], ["자리 옮기기", "불판 위에서 빈자리로 끌면 그 자리로 옮겨집니다."], ["키보드", "← → 로 접시와 자리를 차례로 고릅니다. Enter는 올리기·뒤집기, 스페이스(또는 E)는 먹기입니다."])) +
    part("익은 정도와 점수", table(["알아보는 법", "눈금은 없습니다. 아래쪽 면은 <b>연기</b>로, 위쪽 면은 <b>고기의 색</b>으로 알아봅니다. 뒤집으면 방금까지 익던 면이 위로 올라와 보입니다."], ["연기 없음 · 덜 익음", "한 면이라도 덜 익은 채 먹으면 0점입니다."], ["옅은 연기 · 익음", "그 면 1점."], ["흰 연기 · 딱 좋음", "그 면 3점. 양쪽 다 딱 좋으면 한 점에 6점입니다."], ["회색 연기 · 너무 익음", "그 면 1점."], ["검은 연기 · 타기 직전", "그 면 0점. 그대로 두면 탑니다."])) +
    part("고기와 불", table(...CUTS.map((cut): [string, string] => [cut.name, `한 면이 익는 데 약 ${cut.seconds}초`]), ["가운데 자리", "숯이 가장 센 곳이라 다른 자리보다 빨리 익습니다. 접시를 눌러 올리면 가장자리부터 채워집니다."])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누릅니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("한 점씩 구우면 시간이 모자랍니다. <b>서너 점을 함께</b> 올려 두고 돌아가며 뒤집습니다.", "<b>차돌박이</b>는 금방 익고 <b>목살</b>은 오래 걸립니다. 오래 걸리는 것을 먼저 올립니다.", "<b>흰 연기</b>가 피어오르면 뒤집고, 다시 흰 연기가 피어오르면 끌어냅니다.")),
  help: "마우스·터치: 접시를 눌러 올리고, 고기를 눌러 뒤집고, 불판 밖으로 끌어내 먹습니다<br>키보드: ← → 로 고르고 Enter(올리기·뒤집기), 스페이스(먹기)",
  sides: ["나", ""],
  startWord: "식탁에 앉기",
};
