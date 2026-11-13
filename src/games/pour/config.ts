import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BANDS, pouring, solve, type State } from "./rules";
import { POUR_COLORS, PourView } from "./view";

const NAMES = ["쉬움", "보통", "어려움"];
/** A small picture of a level: three vessels, fuller the harder it is. */
function levelArt(level: number) {
  const glasses = [0, 1, 2].map((i) => {
    const x = 22 + i * 36,
      h = 78 - i * 18,
      fill = Math.round(h * [0.75, 0.4, 0.2][(i + level) % 3]);
    return `<rect x="${x}" y="${116 - fill}" width="26" height="${fill}" fill="#2f8fd0"/><rect x="${x}" y="${116 - h}" width="26" height="${h}" fill="none" stroke="#6f8a96" stroke-width="3"/>`;
  }).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#dfe7ea"/><rect x="10" y="116" width="120" height="8" fill="#3d4a52"/>${glasses}</svg>`;
}
export const pourConfig: PointConfig<State> = {
  game: pouring,
  solo: true,
  showMovable: false,
  view: (host, quality) => new PourView(host, quality),
  colors: POUR_COLORS,
  keyPoints: () => [-3.4, 0, 3.4].map((x) => ({ x, z: 0 })),
  // Liquid into glass.
  contact: (sound) => sound.splash(),
  puzzle: { hint: (state) => solve(state)?.[0] ?? null, hintText: "힌트 — 금색 고리의 비커를 들어, 화살표가 가리키는 비커에 부으세요." },
  stagesFirst: true,
  stages: BANDS.map(([low, high], i) => ({ value: String(i + 1), name: NAMES[i], note: `최소 ${low}–${high}번`, art: levelArt(i + 1) })),
  tallyHtml: (state) => [`<span class="solo-stat"><small>부은 횟수</small><b>${state.ply}</b></span><span class="solo-stat"><small>최소 횟수</small><b>${state.best}</b></span>`, ""],
  name: "물 나누기",
  english: "Water Pouring",
  number: "NO. 41 — NO MARKS ON THE GLASS",
  intro: `<p>실험실의 눈금 없는 비커 세 개.<br>이 비커에서 저 비커로 부어 가며 정해진 양을 맞추세요. 문제는 할 때마다 새로 만들어집니다.</p>`,
  meta: "1인 · 그릇 3개 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>NO MARKS ON THE GLASS</span>`,
  artClass: "morris-art",
  artLabel: "물 나누기 미리보기",
  tableLabel: "THE LAB BENCH",
  tableNote: (variant) => `${NAMES[(Number(variant) || 1) - 1] ?? NAMES[0]} · 무작위 문제`,
  rulesTitle: "눈금 없이, 부어서 맞추세요",
  rules:
    part("기본 규칙", steps("그릇이 세 개 있습니다. <b>가장 큰 그릇만 가득</b> 차 있고 나머지 둘은 비어 있습니다.", "그릇에는 <b>눈금이 없습니다</b>. 다른 도구도 없습니다.", "한 그릇에서 다른 그릇으로 부으면 <b>붓는 그릇이 비거나 받는 그릇이 가득 찰 때까지</b> 옮겨집니다. 중간에 멈출 수 없습니다.", "벽의 화이트보드에 적힌 <b>목표</b>대로 되면 성공입니다.")) +
    part("목표 두 가지", table(["똑같이 나누기", "큰 그릇 둘에 절반씩 담습니다. 예: 8리터와 5리터 그릇에 4리터씩."], ["양 만들기", "세 그릇 가운데 <b>어느 것에든</b> 적힌 양이 담기면 됩니다. 예: 어느 그릇에든 6리터."], ["무작위", "그릇의 크기와 목표는 할 때마다 새로 정해지고, 둘 중 어느 목표가 나올지도 그때 정해집니다. 풀 수 있는 문제만 나옵니다."])) +
    part("붓기와 횟수", table(["붓기", "부을 비커를 누른 뒤 받을 비커를 누릅니다. 비커를 들어 기울여 붓는 모습이 보입니다."], ["그릇 앞 카드", "지금 담긴 양과 그릇의 크기가 적혀 있습니다."], ["부은 횟수 · 최소 횟수", "오른쪽 판에 지금까지 부은 횟수와, 이 문제를 풀 수 있는 <b>가장 적은 횟수</b>가 나란히 나옵니다. 성공하면 둘을 견주어 알려 줍니다."], ["난이도", "최소 횟수로 나뉩니다. 쉬움 2–4번, 보통 5–7번, 어려움 8번 이상."])) +
    part("오른쪽 판", table(["힌트", "지금 상태에서 가장 빨리 푸는 길의 다음 한 번을 알려 줍니다. 부을 비커에 금색 고리가 생기고, <b>받을 비커 위에 화살표</b>가 뜹니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐", "같은 난이도의 새 문제를 만듭니다."], ["다음 스테이지", "성공하면 생깁니다. 같은 난이도의 새 문제가 이어집니다."])) +
    part("처음이라면", notes("작은 그릇은 <b>되</b>입니다. 채웠다 비우기를 되풀이하면 큰 그릇에 남는 양이 그만큼씩 달라집니다.", "가운데 그릇을 가득 채운 뒤 작은 그릇으로 덜어 내면 두 크기의 <b>차이</b>만큼이 남습니다.", "같은 상태로 되돌아왔다면 다른 순서를 써 봅니다.")),
  help: "마우스·터치: 부을 그릇을 누른 뒤 받을 그릇을 누릅니다<br>키보드: 방향키·Enter, Escape로 취소",
  sides: ["나", ""],
  startWord: "실험대 앞에 서기",
};
