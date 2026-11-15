import { part, steps, notes } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STAGES, hint, starBattle, type State } from "./rules";
import { STAR_COLORS, StarBattleView } from "./view";

/** A small picture of a stage: a grid of tinted regions with a few stars. */
function gridArt(size: number) {
  const cell = 96 / size,
    x0 = 22,
    tints = ["#f4c7c3", "#c9e4c5", "#c6d8f0", "#f6e3b4", "#e0cdf0", "#bfe6e6", "#f3d0e4", "#d9e7b8", "#f0d5bf"];
  let squares = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const x = x0 + c * cell,
        y = x0 + r * cell;
      squares += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${tints[Math.floor((r * 2 + c) / 3) % tints.length]}" stroke="#2a2a35" stroke-width="0.6"/>`;
      if ((r * 3 + c * 2) % 7 === 3) squares += `<text x="${x + cell / 2}" y="${y + cell * 0.72}" font-size="${cell * 0.8}" text-anchor="middle" fill="#d9a020">★</text>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#2a2a35"/>${squares}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const starBattleConfig: PointConfig<State> = {
  game: starBattle,
  contact: (sound) => sound.glass(1),
  solo: true,
  showMovable: false,
  view: (host, quality) => new StarBattleView(host, quality),
  colors: STAR_COLORS,
  keyPoints: (state) => state.cells.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 주황 고리가 쳐진 칸을 보세요. 별이 잘못 놓인 칸이면 점으로, 아니면 별을 놓습니다." },
  stagesFirst: true,
  stages: STAGES.map((size, i) => ({ value: String(i + 1), name: `${size}×${size} · ${NAMES[i]}`, note: `별 ${size}개`, art: gridArt(size) })),
  tallyHtml: () => ["", ""],
  name: "스타 배틀",
  english: "Star Battle",
  number: "NO. 58 — ONE STAR EACH",
  intro: `<p>색으로 나뉜 구역마다 별 하나.<br>가로줄·세로줄·구역마다 별을 하나씩 놓되, 별끼리는 대각선으로도 닿지 않게 합니다. 문제는 매번 새로 만들어지고 답은 하나뿐입니다.</p>`,
  meta: "1인 · 5×5부터 9×9 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>ONE STAR EACH</span>`,
  artClass: "morris-art",
  artLabel: "스타 배틀 미리보기",
  tableLabel: "THE STAR GRID",
  tableNote: (variant) => {
    const size = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${size}×${size} · 무작위 문제`;
  },
  rulesTitle: "줄마다, 구역마다 별 하나",
  rules:
    part(
      "기본 규칙",
      steps(
        "판은 굵은 선으로 나뉜 <b>색 구역</b>들로 되어 있습니다. 구역의 수는 판의 한 변과 같습니다.",
        "<b>가로줄마다, 세로줄마다, 구역마다 별을 정확히 하나씩</b> 놓습니다.",
        "별끼리는 <b>닿지 않습니다</b>. 대각선으로 맞닿아도 안 됩니다.",
        "칸을 누를 때마다 별 → 점 → 빈칸으로 바뀝니다. 점은 별이 없다고 적어 두는 것뿐입니다. 규칙을 어긴 별은 빨갛게 보입니다.",
      ),
    ) +
    part("처음이라면", notes("칸이 한 줄에 모여 있는 작은 구역부터 보세요. 그 줄의 다른 칸에는 별이 올 수 없습니다.", "별을 놓으면 둘레 여덟 칸과 같은 줄·같은 구역의 칸에 점을 찍어 두면 편합니다.", "구역 둘이 같은 두 줄 안에 들어 있으면, 그 두 줄의 별은 그 두 구역의 것입니다.")),
  help: "마우스·터치: 칸을 누를 때마다 별 → 점 → 빈칸<br>키보드: 방향키로 칸을 고르고 Enter",
  sides: ["나", ""],
  startWord: "판 앞에 앉기",
};
