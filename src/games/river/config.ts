import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { GO, hint, river, type State } from "./rules";
import { RIVER_COLORS, RiverView } from "./view";

const STAGES: [string, string][] = [["농부와 짐", "늑대·염소·양배추"], ["양과 늑대", "셋씩 · 배에 둘"], ["질투하는 부부", "세 쌍 · 배에 둘"], ["큰 무리", "무작위 · 배에 셋"]];
/** A small picture of a stage: the river, the boat, and marks for the company on the near bank. */
function stageArt(stage: number) {
  const marks = [["#4f7f4a", "#7c858c", "#f1ece0", "#7fbf5a"], ["#f6f3ea", "#f6f3ea", "#f6f3ea", "#7c858c", "#7c858c", "#7c858c"], ["#c8452f", "#c8452f", "#2f62c0", "#2f62c0", "#3f9a55", "#3f9a55"], ["#f6f3ea", "#f6f3ea", "#f6f3ea", "#f6f3ea", "#7c858c", "#7c858c", "#7c858c", "#7c858c"]][stage - 1]
    .map((color, i) => `<circle cx="${18 + (i % 2) * 18}" cy="${26 + Math.floor(i / 2) * 22}" r="7.5" fill="${color}" stroke="#27333a" stroke-width="1.5"/>`)
    .join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="14" fill="#7fb45a"/><rect x="54" y="4" width="34" height="132" fill="#3f8fd0"/><ellipse cx="66" cy="96" rx="9" ry="16" fill="#9a6a3c"/>${marks}</svg>`;
}
export const riverConfig: PointConfig<State> = {
  game: river,
  solo: true,
  showMovable: false,
  view: (host, quality) => new RiverView(host, quality),
  colors: RIVER_COLORS,
  // The keyboard walks the company and then the boat.
  keyPoints: (state) => [...state.actors.map((_, i) => ({ x: i * 1.5, z: 0 })), { x: state.actors.length * 1.5, z: 0 }],
  contact: (sound) => sound.splash(),
  puzzle: { hint, hintText: "힌트 — 화살표가 가리키는 이를 누르세요. 배를 가리키면 배를 띄웁니다." },
  stagesFirst: true,
  stages: STAGES.map(([name, note], i) => ({ value: String(i + 1), name, note, art: stageArt(i + 1) })),
  tools: [{ label: "배 띄우기", point: GO, show: (state) => state.winner === null }],
  tallyHtml: (state) => [`<span class="solo-stat"><small>건넌 횟수</small><b>${state.crossings}</b></span><span class="solo-stat"><small>최소 횟수</small><b>${state.best}</b></span>`, ""],
  name: "강 건너기",
  english: "River Crossing",
  number: "NO. 42 — ALL ACROSS, NONE EATEN",
  intro: `<p>강가에 모인 일행과 작은 배 한 척.<br>함께 두면 안 되는 이들을 떼어 놓으며 모두 강 건너로 옮기세요.</p>`,
  meta: "1인 · 스테이지 네 가지 · 배 한 척",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>ALL ACROSS, NONE EATEN</span>`,
  artClass: "morris-art",
  artLabel: "강 건너기 미리보기",
  tableLabel: "THE RIVER",
  tableNote: (variant) => STAGES[(Number(variant) || 1) - 1]?.[0] ?? STAGES[0][0],
  rulesTitle: "모두 건너되, 탈이 없게",
  rules:
    part("기본 규칙", steps("모두 <b>왼쪽 강가</b>에서 시작합니다. 전부 <b>오른쪽 강가</b>로 옮기면 성공입니다.", "배에는 정해진 수만 탈 수 있고, <b>빈 배는 건너지 못합니다</b>.", "탈 이를 눌러 배에 태우고(다시 누르면 내립니다), 배를 누르거나 <b>배 띄우기</b>를 누르면 건넙니다. 건너면 탄 이들은 그쪽 강가에 내립니다.", "건넌 뒤에 어느 한쪽에 <b>함께 두면 안 되는 이들</b>이 남으면 실패입니다.", "실패해도 끝이 아닙니다. 무엇이 잘못됐는지 알려 주고, <b>무르기</b>로 되돌려 이어서 할 수 있습니다.")) +
    part("스테이지", table(["농부와 짐", "농부, 그리고 짐 셋(늑대·염소·양배추, 여우·닭·곡식, 고양이·쥐·치즈 가운데 하나가 무작위로). <b>농부만 노를 젓고</b> 짐은 하나만 실을 수 있습니다. 농부가 없는 강가에서는 앞의 것이 뒤의 것을 먹습니다."], ["양과 늑대", "양 셋, 늑대 셋. 누구든 노를 젓습니다. 어느 강가에서든 <b>늑대가 양보다 많으면</b> 양이 잡아먹힙니다(양이 하나도 없으면 괜찮습니다)."], ["질투하는 부부", "세 쌍(같은 색 옷이 한 쌍). <b>부인은 남편이 곁에 없을 때 다른 남편과 함께 있을 수 없습니다.</b> 강가에서도, 배 안에서도 그렇습니다."], ["큰 무리", "양과 늑대 넷씩이나 다섯씩, 또는 부부 네 쌍 가운데 하나가 무작위로 나옵니다. 배에 셋이 탑니다."])) +
    part("횟수와 오른쪽 판", table(["건넌 횟수 · 최소 횟수", "지금까지 건넌 횟수와, 이 문제를 풀 수 있는 가장 적은 횟수가 나란히 나옵니다. 성공하면 견주어 알려 줍니다."], ["힌트", "가장 빨리 푸는 길에서 다음에 누를 이(또는 배) 위에 화살표가 뜹니다. 실패한 상태에서는 무르기부터 하라고 알려 줍니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 스테이지의 새 문제(무작위가 있는 스테이지는 다른 일행)가 나옵니다."])) +
    part("처음이라면", notes("건너갔던 이가 <b>다시 돌아오는</b> 것이 열쇠입니다. 한 번 건넌 이는 그대로 둔다는 생각을 버립니다.", "농부와 짐에서는 가운데 것(염소)이 양쪽 모두와 문제가 됩니다. 그것부터 옮깁니다.", "양과 늑대에서는 떠나는 강가와 닿는 강가를 <b>둘 다</b> 셉니다.")),
  help: "마우스·터치: 탈 이를 눌러 태우고, 배를 눌러 건넙니다<br>키보드: 방향키로 고르고 Enter (맨 끝이 배)",
  sides: ["나", ""],
  startWord: "강가에 서기",
};
