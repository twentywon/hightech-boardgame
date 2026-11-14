import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { MAX, MIN, hanoi, hint, type State } from "./rules";
import { HANOI_COLORS, HanoiView } from "./view";

const COUNTS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i),
  GLAZE = ["#e2483d", "#f08a2c", "#f2c230", "#6cb84a", "#2fa6a0", "#3b78d8", "#7a55c7", "#c44f9a"];
/** A small picture of a tower: its discs on the first of three pegs. */
function towerArt(discs: number) {
  const pegs = [30, 70, 110].map((x) => `<rect x="${x - 1.5}" y="26" width="3" height="92" rx="1.5" fill="#c9a44a"/>`).join(""),
    thick = Math.min(11, 84 / discs),
    stack = Array.from({ length: discs }, (_, i) => {
      const size = discs - i,
        half = 5 + (size / discs) * 15;
      return `<rect x="${30 - half}" y="${118 - (i + 1) * thick}" width="${half * 2}" height="${thick - 1}" rx="${Math.min(4, thick / 2)}" fill="${GLAZE[size - 1]}"/>`;
    }).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#efe6d4"/>${pegs}<rect x="10" y="118" width="120" height="8" rx="3" fill="#5a3a22"/>${stack}</svg>`;
}
export const hanoiConfig: PointConfig<State> = {
  game: hanoi,
  solo: true,
  showMovable: false,
  view: (host, quality) => new HanoiView(host, quality),
  colors: HANOI_COLORS,
  keyPoints: () => [-3.5, 0, 3.5].map((x) => ({ x, z: 0 })),
  puzzle: { hint, hintText: "힌트 — 금색 고리 기둥의 맨 위 원판을, 화살표가 가리키는 기둥으로 끌어다 놓으세요." },
  stagesFirst: true,
  stages: COUNTS.map((discs) => ({ value: String(discs), name: `원판 ${discs}개`, note: `최소 ${2 ** discs - 1}번`, art: towerArt(discs) })),
  tallyHtml: (state) => [`<span class="solo-stat"><small>옮긴 횟수</small><b>${state.ply}</b></span><span class="solo-stat"><small>최소 횟수</small><b>${state.best}</b></span>`, ""],
  name: "하노이의 탑",
  english: "Tower of Hanoi",
  number: "NO. 43 — ONE DISC AT A TIME",
  intro: `<p>기둥 셋과 크기가 다른 원판들.<br>한 번에 하나씩, 큰 것을 작은 것 위에 올리지 않고 탑을 통째로 옮기세요.</p>`,
  meta: `1인 · 원판 ${MIN}–${MAX}개 · 기둥 3개`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>ONE DISC AT A TIME</span>`,
  artClass: "morris-art",
  artLabel: "하노이의 탑 미리보기",
  tableLabel: "THE THREE PEGS",
  tableNote: (variant) => `원판 ${Math.max(MIN, Math.min(MAX, Number(variant) || MIN))}개`,
  rulesTitle: "한 번에 하나씩, 작은 것 위에만",
  rules:
    part("기본 규칙", steps("원판이 모두 <b>왼쪽 기둥</b>에 큰 것부터 차례로 쌓여 있습니다.", "한 번에 <b>맨 위 원판 하나</b>만 다른 기둥으로 옮길 수 있습니다.", "원판은 빈 기둥이나 <b>자기보다 큰 원판 위</b>에만 놓을 수 있습니다.", "탑을 통째로 <b>오른쪽 기둥</b>에 옮기면 성공입니다.")) +
    part("옮기기와 횟수", table(["옮기기", "기둥의 맨 위 원판을 <b>위로 끌어 올려</b> 기둥에서 빼고, 다른 기둥 위로 가져가 놓습니다. 눌러서는 옮겨지지 않습니다. 놓을 수 없는 곳에서 놓으면 제자리로 돌아갑니다."], ["옮긴 횟수 · 최소 횟수", "오른쪽 판에 지금까지 옮긴 횟수와 가장 적은 횟수가 나란히 나옵니다. 원판이 n개면 최소 횟수는 2ⁿ−1번입니다."], ["원판 수", `앉을 때와 <b>새 게임</b>에서 ${MIN}개부터 ${MAX}개까지 고릅니다. 하나 늘 때마다 횟수가 두 배 남짓 늘어납니다.`])) +
    part("오른쪽 판", table(["힌트", "지금 놓인 상태에서 가장 빨리 끝내는 다음 한 번을 알려 줍니다. 꺼낼 기둥에 금색 고리가, 놓을 기둥 위에 화살표가 생깁니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."])) +
    part("처음이라면", notes("가장 큰 원판을 옮기려면 그 위의 것들을 <b>가운데 기둥</b>에 먼저 통째로 옮겨야 합니다. 작은 탑 옮기기를 되풀이하는 셈입니다.", "가장 작은 원판은 두 번에 한 번씩, 늘 같은 방향으로 돕니다.", "원판이 홀수 개면 첫 원판을 오른쪽으로, 짝수 개면 가운데로 보냅니다.")),
  help: "마우스·터치: 맨 위 원판을 끌어서 다른 기둥에 놓습니다<br>키보드: ← → 로 기둥을 고르고 Enter, Escape로 취소",
  sides: ["나", ""],
  startWord: "탑 앞에 앉기",
};
