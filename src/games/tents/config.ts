import { part, steps, notes } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STAGES, hint, tents, type State } from "./rules";
import { TENTS_COLORS, TentsView } from "./view";

/** A small picture of a stage: a field with a few trees and tents. */
function fieldArt(size: number) {
  const cell = 96 / size,
    x0 = 22;
  let squares = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const x = x0 + c * cell,
        y = x0 + r * cell;
      squares += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(r + c) % 2 ? "#7fae55" : "#89b85d"}" stroke="#3c6a2a" stroke-width="0.8"/>`;
      if ((r * 5 + c * 3) % 7 === 2) squares += `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.32}" fill="#2f6b3a"/>`;
      else if ((r * 5 + c * 3) % 7 === 5) squares += `<path d="M${x + cell * 0.2} ${y + cell * 0.8}L${x + cell / 2} ${y + cell * 0.2}L${x + cell * 0.8} ${y + cell * 0.8}z" fill="#e0782e"/>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#5a3f28"/>${squares}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const tentsConfig: PointConfig<State> = {
  game: tents,
  contact: (sound) => sound.soft(2),
  solo: true,
  showMovable: false,
  view: (host, quality) => new TentsView(host, quality),
  colors: TENTS_COLORS,
  keyPoints: (state) => state.cells.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 칸을 보세요. 텐트가 잘못 쳐진 칸이면 X로, 아니면 텐트를 칩니다." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: `텐트 약 ${Math.round(stage.size * stage.size * stage.share)}개`, art: fieldArt(stage.size) })),
  tallyHtml: () => ["", ""],
  name: "텐트 치기",
  english: "Tents",
  number: "NO. 57 — A TENT BY EVERY TREE",
  intro: `<p>나무가 드문드문 선 캠핑장.<br>나무마다 옆에 텐트를 하나씩 칩니다. 가장자리 숫자는 그 줄의 텐트 수입니다. 'Tents'로 알려진 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 5×5부터 9×9 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>A TENT BY EVERY TREE</span>`,
  artClass: "morris-art",
  artLabel: "텐트 치기 미리보기",
  tableLabel: "THE CAMPSITE",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 무작위 문제`;
  },
  rulesTitle: "나무 옆에 텐트를 치세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "나무 하나마다 <b>텐트 하나</b>를 칩니다. 텐트는 짝이 되는 나무의 <b>위·아래·왼쪽·오른쪽</b> 바로 옆 칸에 섭니다.",
        "텐트끼리는 <b>닿지 않습니다</b>. 대각선으로 맞닿아도 안 됩니다.",
        "왼쪽과 위쪽의 숫자는 그 가로줄과 세로줄에 서는 <b>텐트의 수</b>입니다.",
        "칸을 누를 때마다 텐트 → <b>X 표시</b> → 빈칸으로 바뀝니다. 텐트를 한 번 더 누르면 X가 되고, X는 텐트가 없다고 적어 두는 것뿐입니다. 모든 텐트를 맞게 치면 성공입니다.",
      ),
    ) +
    part("처음이라면", notes("숫자가 <b>0</b>인 줄은 모두 X입니다.", "어느 나무와도 닿지 않는 칸에는 텐트를 칠 수 없습니다.", "텐트를 친 칸의 둘레 여덟 칸에는 텐트가 올 수 없습니다.")),
  help: "마우스·터치: 칸을 누를 때마다 텐트 → X → 빈칸<br>키보드: 방향키로 칸을 고르고 Enter",
  sides: ["나", ""],
  startWord: "캠핑장에 들어가기",
};
