import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DIRS, E, N, S, STAGES, W, ends, grow, hint, pipes, type State } from "./rules";
import { PIPES_COLORS, PipesView } from "./view";

/** A small picture of a stage: paving stones with pipes laid out as one tree, a tank in the middle and red-roofed houses at the ends. */
function gardenArt(size: number) {
  let seed = size * 131 + 7;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296,
    centre = Math.floor((size - 1) / 2) * (size + 1),
    masks = grow(size, centre, random),
    cell = 96 / size,
    x0 = 22,
    way: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
  let stones = "",
    lines = "",
    marks = "";
  masks.forEach((mask, i) => {
    const x = x0 + (i % size) * cell,
      y = x0 + Math.floor(i / size) * cell,
      cx = x + cell / 2,
      cy = y + cell / 2;
    stones += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="1.5" fill="${(i * 7) % 3 ? "#c9c2b6" : "#bdb8ae"}"/>`;
    for (const bit of DIRS) if (mask & bit) lines += `M${cx} ${cy}L${cx + (way[bit][0] * cell) / 2} ${cy + (way[bit][1] * cell) / 2}`;
    if (i === centre) marks += `<circle cx="${cx}" cy="${cy}" r="${cell * 0.3}" fill="#4a8cc4" stroke="#24557f" stroke-width="1.2"/>`;
    else if (ends(mask) === 1) {
      const s = cell * 0.24;
      marks += `<rect x="${cx - s}" y="${cy - s * 0.6}" width="${s * 2}" height="${s * 1.5}" fill="#f3e6cf"/><path d="M${cx - s * 1.2} ${cy - s * 0.5}L${cx} ${cy - s * 1.5}L${cx + s * 1.2} ${cy - s * 0.5}z" fill="#b4492f"/>`;
    }
  });
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#6f9a4a"/><rect x="${x0 - 3}" y="${x0 - 3}" width="102" height="102" rx="3" fill="#9a4a33"/><rect x="${x0}" y="${x0}" width="96" height="96" fill="#8f8a80"/>${stones}<path d="${lines}" stroke="#4f9fe0" stroke-width="${Math.max(2.4, cell * 0.2)}" stroke-linecap="round" fill="none"/>${marks}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const pipesConfig: PointConfig<State> = {
  game: pipes,
  contact: (sound) => sound.knock(3),
  solo: true,
  showMovable: false,
  view: (host, quality) => new PipesView(host, quality),
  colors: PIPES_COLORS,
  keyPoints: (state) => state.tiles.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 칸을 보세요. 금색 화살표가 가리키는 쪽으로 관이 열리도록 돌립니다." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: `포석 ${stage.size * stage.size}장`, art: gardenArt(stage.size) })),
  tallyHtml: () => ["", ""],
  name: "파이프 잇기",
  english: "Pipes",
  number: "NO. 71 — LET THE WATER RUN",
  intro: `<p>포석이 깔린 뒷마당에 물탱크 하나와 작은 집들.<br>관 조각을 돌려 탱크의 물이 모든 집에 닿게 잇습니다. 'Net'으로 알려진 퍼즐이고 문제는 매번 새로 만들어지며 답은 하나뿐입니다.</p>`,
  meta: "1인 · 4×4부터 8×8 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LET THE WATER RUN</span>`,
  artClass: "morris-art",
  artLabel: "파이프 잇기 미리보기",
  tableLabel: "THE BACKYARD",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 무작위 문제`;
  },
  rulesTitle: "관을 돌려 물길을 이으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "포석마다 <b>관 조각</b>이 하나씩 놓여 있습니다. 가운데 가까이에 <b>물탱크</b>가 있고, 관이 끝나는 막다른 칸에는 <b>집</b>이 있습니다.",
        "칸을 누르면 그 조각이 <b>시계 방향으로 90도</b> 돕니다. 네 방향이 모두 열린 십자관은 돌려도 같으므로 돌지 않습니다.",
        "관의 열린 끝은 모두 <b>이웃 칸의 열린 끝</b>과 맞물려야 합니다. 정원 밖이나 막힌 쪽을 향한 끝에서는 물이 샙니다.",
        "탱크와 이어진 관에는 <b>물이 파랗게</b> 찹니다. 모든 조각이 이어져 물이 <b>모든 집</b>에 닿으면 성공입니다. 답은 하나뿐입니다.",
      ),
    ) +
    part(
      "관 조각",
      table(
        ["막다른 관", "끝이 하나. 그 칸에는 집이 서 있고, 관은 집으로 들어갑니다."],
        ["곧은 관", "마주 보는 두 끝. 놓이는 모양은 가로와 세로 두 가지뿐입니다."],
        ["굽은 관", "옆으로 이웃한 두 끝."],
        ["세 갈래 관", "끝이 셋. 막힌 쪽이 하나입니다."],
        ["십자관", "네 끝이 모두 열려 있어 돌릴 필요가 없습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "가장자리와 모서리부터 보세요. 정원 밖을 향할 수 없으니 놓일 수 있는 방향이 몇 안 됩니다.",
        "집과 집은 바로 이어지지 않습니다. 이으면 그 둘만 따로 떨어지기 때문입니다.",
        "물길은 나뭇가지처럼 갈라질 뿐 다시 만나지 않습니다. 관이 고리를 이루면 어딘가 다른 곳이 끊깁니다.",
      ),
    ),
  help: "마우스·터치: 칸을 누르면 관이 시계 방향으로 돕니다<br>키보드: 방향키로 칸을 고르고 Enter",
  sides: ["나", ""],
  startWord: "정원에 들어가기",
};
