import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BEST, BURN, LIVES, SERVE, grill, type State } from "./rules";
import { CUTS } from "./sim";
import { GRILL_COLORS, GrillView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
export const grillConfig: PointConfig<State> = {
  game: grill,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  view: (host, quality) => new GrillView(host, quality),
  colors: GRILL_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("건진 고기", state.served) + stat("탄 고기", `${state.burnt}/${LIVES}`), ""],
  contact: (sound, state) => (state.last === BURN ? sound.lose() : state.last === SERVE + BEST ? sound.sparkle() : state.last !== null && state.last >= SERVE ? sound.hop() : sound.tap()),
  name: "고기 굽기",
  english: "Meat Grill",
  number: "NO. 47 — TURN ONCE, TAKE IT OFF",
  intro: `<p>숯불 위에 고기가 한 점씩 올라옵니다.<br>알맞을 때 한 번 뒤집고, 양쪽이 익으면 건지세요. 세 점을 태우면 끝납니다.</p>`,
  meta: `1인 · 자리 7곳 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>TURN ONCE, TAKE IT OFF</span>`,
  artClass: "hexa-art",
  artLabel: "고기 굽기 미리보기",
  tableLabel: "THE GRILL",
  tableNote: () => `자리 7곳 · 탄 고기 ${LIVES}점까지`,
  rulesTitle: "한 번 뒤집고, 익으면 건지기",
  rules:
    part("기본 규칙", steps("불판 일곱 자리에 고기가 한 점씩 저절로 올라옵니다.", "고기는 <b>불에 닿은 아래쪽 면</b>만 익습니다. 고기 둘레의 고리가 그 면이 얼마나 익었는지 보여 줍니다.", "고기를 <b>한 번 누르면 뒤집힙니다</b>. 뒤집은 고기를 <b>다시 누르면 건져집니다</b>.", "너무 오래 두어 고리가 다 차면 고기가 <b>타서 사라집니다</b>.", `고기를 <b>${LIVES}점 태우면</b> 끝납니다. 그 전까지 점수를 모읍니다.`, "시간이 갈수록 고기가 더 자주 올라옵니다.")) +
    part("익은 정도와 점수", table(["흰 고리 · 덜 익음", "한 면이라도 덜 익은 채 건지면 0점입니다."], ["초록 고리 · 익음", "그 면 1점."], ["금색 고리 · 딱 좋음", "그 면 3점. 양쪽 다 딱 좋으면 한 점에 6점입니다."], ["주황 고리 · 너무 익음", "그 면 1점. 연기가 짙어집니다."], ["빨간 고리 · 타기 직전", "그 면 0점. 곧 탑니다."])) +
    part("고기와 불", table(...CUTS.map((cut): [string, string] => [cut.name, `한 면이 익는 데 약 ${cut.seconds}초`]), ["가운데 자리", "숯이 가장 센 곳이라 다른 자리보다 빨리 익습니다."], ["↻ 표시", "아직 뒤집지 않은 고기에 붙어 있습니다."])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누릅니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("금색이 될 때까지 기다렸다 뒤집고, 다시 금색이 되면 건집니다.", "<b>차돌박이</b>는 금방 익습니다. 올라오면 먼저 봅니다.", "여러 점이 한꺼번에 급해지면 점수보다 <b>태우지 않는 것</b>이 먼저입니다. 덜 좋은 고기는 그냥 건집니다.")),
  help: "마우스·터치: 고기를 눌러 뒤집고, 다시 눌러 건집니다<br>키보드: ← → 로 자리를 고르고 Enter",
  sides: ["나", ""],
  startWord: "불판 앞에 앉기",
};
