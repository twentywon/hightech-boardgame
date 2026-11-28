import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STAGES, hint, skyline, type State } from "./rules";
import { SKYLINE_COLORS, SkylineView } from "./view";

/** A small picture of a stage: a block of plots with a few buildings of different heights. */
function blockArt(size: number) {
  const cell = 96 / size,
    x0 = 22,
    tones = ["#a8896a", "#d9a441", "#6aa36f", "#4f8fc9", "#8b6cc6", "#3a9f98"];
  let plots = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const x = x0 + c * cell,
        y = x0 + r * cell,
        h = ((r * 2 + c * 3) % size) + 1;
      plots += `<rect x="${x + 2}" y="${y + 2}" width="${cell - 4}" height="${cell - 4}" fill="#cfcac0"/>`;
      if ((r + c * 2) % 3) plots += `<rect x="${x + cell * 0.2}" y="${y + cell * 0.2}" width="${cell * 0.6}" height="${cell * 0.6}" fill="${tones[h - 1]}"/><text x="${x + cell / 2}" y="${y + cell * 0.62}" font-size="${cell * 0.4}" font-weight="800" fill="#fff" text-anchor="middle" font-family="Arial">${h}</text>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#3c4046"/>${plots}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const skylineConfig: PointConfig<State> = {
  game: skyline,
  contact: (sound) => sound.wood(2),
  solo: true,
  showMovable: false,
  view: (host, quality) => new SkylineView(host, quality),
  colors: SKYLINE_COLORS,
  keyPoints: (state) => state.cells.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 앞줄의 건물을, 금색 고리가 쳐진 자리로 끌어다 놓으세요." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: stage.keep >= 1 ? "숫자 모두 공개" : stage.keep >= 0.6 ? "숫자 일부 숨김" : "숫자 많이 숨김", art: blockArt(stage.size) })),
  tallyHtml: () => ["", ""],
  name: "빌딩 퍼즐",
  english: "Building Puzzle",
  number: "NO. 53 — HOW MANY TOWERS DO YOU SEE",
  intro: `<p>한 블록의 모든 자리에 높이가 다른 빌딩을 세웁니다.<br>가장자리의 숫자는 그쪽에서 바라볼 때 보이는 빌딩의 수입니다. 높은 빌딩 뒤의 낮은 빌딩은 가려 보이지 않습니다. 'Skyscrapers'로 알려진 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 4×4부터 6×6 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>HOW MANY TOWERS DO YOU SEE</span>`,
  artClass: "morris-art",
  artLabel: "빌딩 퍼즐 미리보기",
  tableLabel: "THE CITY BLOCK",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 무작위 문제`;
  },
  rulesTitle: "보이는 빌딩을 세어 높이를 찾으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "판이 n×n이면 빌딩은 <b>1층부터 n층</b>까지입니다. 모든 자리에 빌딩을 하나씩 세웁니다.",
        "가로줄과 세로줄마다 <b>같은 높이는 한 번씩만</b> 섭니다.",
        "가장자리의 숫자는 그 자리에서 줄을 따라 바라볼 때 <b>보이는 빌딩의 수</b>입니다. 높은 빌딩은 그 뒤의 낮은 빌딩을 가립니다. 숫자가 없는 자리는 무엇이든 됩니다.",
        "판 앞의 빌딩을 <b>끌어다 자리에 놓습니다</b>. 자리를 누를 때마다 한 층씩 높아지고, 가장 높은 다음에는 비워집니다. 놓은 빌딩은 옮기거나 판 밖으로 끌어내 치울 수 있습니다.",
      ),
    ) +
    part("처음이라면", notes("<b>1</b>이 적힌 쪽 바로 앞에는 가장 높은 빌딩이 섭니다.", "<b>n</b>이 적힌 줄은 그쪽에서부터 1층, 2층, … 차례로 높아집니다.", "두 숫자가 마주 보는 줄에서는 가장 높은 빌딩이 서는 자리를 먼저 좁혀 보세요.")),
  help: "마우스·터치: 판 앞의 빌딩을 자리로 끌어다 놓거나, 자리를 눌러 한 층씩 올립니다<br>키보드: 방향키로 자리를 고르고 Enter를 누를 때마다 한 층씩",
  sides: ["나", ""],
  startWord: "블록에 들어가기",
};
