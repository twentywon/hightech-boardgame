import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BEST, BURN, DRESS, EAT, EXTRA, FLIP, LAY, SECONDS, WRAP, clock, grill, type State } from "./rules";
import { CUTS, FILLING, PORTION, RELISHES } from "./sim";
import { GRILL_COLORS, GrillView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a mode: the grill, with a clock or the sign for no end. */
function modeArt(endless: boolean) {
  const mark = endless
    ? `<path d="M52 104c-12 0-12-18 0-18s24 18 36 18 12-18 0-18-24 18-36 18z" fill="none" stroke="#2a2f38" stroke-width="5"/>`
    : `<circle cx="70" cy="96" r="16" fill="#fffdf6" stroke="#2a2f38" stroke-width="4"/><path d="M70 86v10l7 5" fill="none" stroke="#2a2f38" stroke-width="4" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#d9b07c"/><circle cx="70" cy="50" r="34" fill="#2b2d31"/><circle cx="70" cy="50" r="27" fill="#c8501e"/><path d="M48 50h44M70 28v44M54 34l32 32M86 34l-32 32" stroke="#d3d8de" stroke-width="2"/><rect x="56" y="42" width="28" height="12" rx="4" fill="#e8a0a4"/>${mark}</svg>`;
}
export const grillConfig: PointConfig<State> = {
  game: grill,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  view: (host, quality) => new GrillView(host, quality),
  colors: GRILL_COLORS,
  // 새 게임 asks which kind of meal.
  stages: [
    { value: "1", name: "일반 모드", note: `${SECONDS}초 동안 점수 내기`, art: modeArt(false) },
    { value: "2", name: "무제한 모드", note: "시간 제한 없이", art: modeArt(true) },
  ],
  tallyHtml: (state) => [stat("점수", state.score) + stat(state.endless ? "지난 시간" : "남은 시간", state.endless ? clock(state.gone) : `${state.left}초`)+ `<i hidden data-eaten="${state.eaten}" data-wraps="${state.wraps}" data-burnt="${state.burnt}"></i>`, ""],
  // Meat hisses as it is laid on the grill and each time it is turned; anything eaten is chewed.
  contact: (sound, state) => {
    const last = state.last;
    if (last === LAY || last === FLIP) return sound.sizzle();
    if (last === BURN) return sound.lose();
    if (last === DRESS) return sound.plastic();
    if (last === null || last < EAT) return sound.tap();
    sound.chew();
    if (last === EAT + BEST || last >= WRAP + 8) sound.sparkle();
  },
  name: "고기 굽기",
  english: "Meat Grill",
  number: "NO. 47 — LAY, TURN, WRAP",
  intro: `<p>숯불 화로를 가운데 둔 고깃집 식탁.<br>접시의 고기를 불판에 올려 알맞게 굽고, 그냥 먹거나 쌈을 싸 드세요.</p>`,
  meta: `1인 · 일반 ${SECONDS}초 / 무제한 · 쌈 싸기`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LAY, TURN, WRAP</span>`,
  artClass: "hexa-art",
  artLabel: "고기 굽기 미리보기",
  tableLabel: "THE GRILL TABLE",
  tableNote: (variant) => (variant === "2" ? "무제한 모드" : `일반 모드 · ${SECONDS}초`),
  rulesTitle: "올리고, 뒤집고, 싸 먹기",
  rules:
    part("기본 규칙", steps(`화로 양옆에 고기 접시가 ${CUTS.length}개 있습니다. 접시가 비면 <b>바로 다시 ${PORTION}점</b>이 채워집니다.`, "접시의 고기를 <b>불판으로 끌어다 놓습니다</b>. 눌러서는 올라가지 않습니다. 불판에는 일곱 점까지 올릴 수 있습니다.", "고기는 <b>불에 닿은 아래쪽 면</b>만 익습니다. <b>불판 위의 고기를 누르면 뒤집힙니다</b>. 몇 번이든 뒤집을 수 있습니다.", "다 익은 고기는 오른쪽 위의 <b>큰 접시로 끌어다 놓으면</b> 먹습니다. 큰 접시에 <b>쌈채소를 먼저</b> 올려 두었으면 먹지 않고 쌈을 쌉니다. 접시가 아닌 곳에 놓으면 제자리로 돌아갑니다.", "너무 오래 두면 <b>탑니다</b>. 탄 고기는 그 자리를 차지한 채 남으니 끌어내 버립니다.")) +
    part("모드", table(["일반 모드", `${SECONDS}초 동안 점수를 최대한 냅니다. 시간이 끝났을 때 불판과 큰 접시에 남은 것은 점수가 없습니다.`], ["무제한 모드", "시간 제한이 없습니다. 끝도 없으니 마음껏 굽습니다."], ["고르기", "위쪽의 <b>새 게임</b>을 누르면 두 모드가 그림으로 나옵니다. 처음 앉으면 일반 모드입니다."])) +
    part("쌈 싸기", table(["큰 접시", "오른쪽 위의 빈 큰 접시입니다. 비어 있을 때 고기를 놓으면 그 고기만 바로 먹습니다(고기 점수만)."], ["쌈채소", "아래쪽 바구니에서 큰 접시로 끌어다 놓습니다. <b>쌈채소를 먼저 놓아야</b> 쌈 싸기가 시작됩니다."], ["고기", `불판에서 큰 접시로 끌어다 놓습니다. ${FILLING}점까지 올라갑니다. 탄 고기는 올라가지 않습니다.`], ["양념", `위쪽의 ${RELISHES.join(", ")}을 쌈채소 위로 끌어다 놓습니다. 한 가지씩 한 번만 올라갑니다.`], ["먹기", "큰 접시를 <b>누르면</b> 싼 쌈을 먹습니다."], ["점수", "고기 점수에 더해 쌈 <b>+2점</b>, 양념 한 가지마다 <b>+1점</b>(세 가지까지)입니다. 익은 고기가 없으면 0점입니다."], ["추가 시간", `익은 고기와 양념을 모두 넣은 쌈을 먹으면 일반 모드에서 <b>시간이 ${EXTRA}초</b> 늘어납니다.`])) +
    part("익은 정도와 점수", table(["알아보는 법", "눈금은 없습니다. 아래쪽 면은 <b>연기</b>로, 위쪽 면은 <b>고기의 색</b>으로 알아봅니다. 뒤집으면 방금까지 익던 면이 위로 올라와 보입니다."], ["연기 없음 · 덜 익음", "한 면이라도 덜 익은 고기는 0점입니다."], ["옅은 연기 · 익음", "그 면 1점."], ["흰 연기 · 딱 좋음", "그 면 3점. 양쪽 다 딱 좋으면 한 점에 6점입니다."], ["회색 연기 · 너무 익음", "그 면 1점."], ["검은 연기 · 타기 직전", "그 면 0점. 그대로 두면 탑니다."])) +
    part("고기와 불", table(...CUTS.map((cut): [string, string] => [cut.name, `한 면이 익는 데 약 ${cut.seconds}초`]), ["가운데 자리", "숯이 가장 센 곳이라 다른 자리보다 빨리 익습니다."], ["자리 옮기기", "불판 위에서 빈자리로 끌면 그 자리로 옮겨집니다."])) +
    part("키보드", table(["고르기", "← → 로 접시, 불판 자리, 큰 접시를 차례로 고릅니다."], ["Enter", "접시에서는 올리기, 자리에서는 뒤집기, 큰 접시에서는 먹기."], ["스페이스 · S", "자리의 고기를 큰 접시로 보냅니다. 쌈채소가 없으면 바로 먹고, 있으면 쌈에 들어갑니다."], ["L · 1–4", `L은 쌈채소, 1–4는 ${RELISHES.join("·")}을 큰 접시에 올립니다.`])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누릅니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("한 점씩 구우면 시간이 모자랍니다. <b>서너 점을 함께</b> 올려 두고 돌아가며 뒤집습니다.", "<b>차돌박이</b>는 금방 익고 <b>목살</b>은 오래 걸립니다. 오래 걸리는 것을 먼저 올립니다.", "<b>흰 연기</b>가 피어오르면 뒤집고, 다시 흰 연기가 피어오르면 큰 접시로 끌어냅니다.", "쌈채소와 양념은 고기가 익는 동안 미리 올려 둡니다. 잘 익은 두 점을 싸면 한 번에 17점까지 납니다.")),
  help: "마우스·터치: 접시의 고기를 불판으로 끌어다 놓고, 눌러서 뒤집고, 큰 접시로 끌어내 먹습니다(쌈채소를 먼저 놓으면 쌈)<br>키보드: ← → 로 고르고 Enter, 스페이스(큰 접시로), L(쌈채소), 1–4(양념)",
  sides: ["나", ""],
  startWord: "식탁에 앉기",
};
