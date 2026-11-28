import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STAGES, haunt, hint, type State } from "./rules";
import { HAUNT_COLORS, HauntView } from "./view";

/** A small picture of a stage: a dark board with a few mirrors and a ghost. */
function boardArt(size: number) {
  const cell = 96 / size,
    x0 = 22;
  let squares = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const x = x0 + c * cell,
        y = x0 + r * cell;
      squares += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(r + c) % 2 ? "#3c3843" : "#4a4550"}" stroke="#2a2030" stroke-width="1"/>`;
      if ((r * 3 + c * 5) % 7 === 1) squares += `<line x1="${x + 4}" y1="${(r + c) % 2 ? y + 4 : y + cell - 4}" x2="${x + cell - 4}" y2="${(r + c) % 2 ? y + cell - 4 : y + 4}" stroke="#cfe3ea" stroke-width="3"/>`;
      if ((r * 5 + c * 3) % 9 === 4) squares += `<path d="M${x + cell / 2} ${y + cell * 0.18}c${cell * 0.24} 0 ${cell * 0.28} ${cell * 0.2} ${cell * 0.28} ${cell * 0.4}v${cell * 0.32}l-${cell * 0.14} -${cell * 0.08}-${cell * 0.14} ${cell * 0.08}-${cell * 0.14}-${cell * 0.08}-${cell * 0.14} ${cell * 0.08}v-${cell * 0.32}c0-${cell * 0.2} ${cell * 0.04}-${cell * 0.4} ${cell * 0.28}-${cell * 0.4}z" fill="#f3f6f8"/>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#1b1622"/>${squares}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const hauntConfig: PointConfig<State> = {
  game: haunt,
  contact: (sound) => sound.soft(3),
  solo: true,
  showMovable: false,
  view: (host, quality) => new HauntView(host, quality),
  colors: HAUNT_COLORS,
  keyPoints: (state) => state.cells.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 앞줄의 괴물을, 금색 고리가 쳐진 칸으로 끌어다 놓으세요." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: stage.shown ? `괴물 ${stage.shown}마리 공개` : "공개 없음", art: boardArt(stage.size) })),
  tallyHtml: () => ["", ""],
  name: "할로윈 퍼즐",
  english: "Haunted Mirrors",
  number: "NO. 51 — WHO HIDES IN THE MIRRORS",
  intro: `<p>거울이 비스듬히 선 유령의 집.<br>빈 칸마다 유령·뱀파이어·좀비가 하나씩 숨어 있습니다. 판 앞의 괴물을 끌어다 칸에 놓으세요. 가장자리의 숫자는 그 자리에서 들여다볼 때 보이는 괴물의 수입니다. 'Undead'(유령 거울 미로)로 알려진 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 4×4부터 6×6 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>WHO HIDES IN THE MIRRORS</span>`,
  artClass: "morris-art",
  artLabel: "할로윈 퍼즐 미리보기",
  tableLabel: "THE HAUNTED MIRRORS",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 무작위 문제`;
  },
  rulesTitle: "보이는 괴물을 세어 찾으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "거울이 없는 칸에는 <b>괴물이 꼭 하나</b> 있습니다. 판 앞에 괴물마다 모두 몇 마리인지 적혀 있습니다.",
        "가장자리의 숫자는 그 자리에서 판 안으로 곧장 들여다볼 때 <b>보이는 괴물의 수</b>입니다. 시선은 거울에 닿을 때마다 꺾여 나아가다 판 밖으로 나갑니다.",
        "판 앞의 괴물을 <b>끌어다 칸에 놓습니다</b>. 놓은 괴물은 다른 칸으로 옮기거나, 판 밖으로 끌어내 치울 수 있습니다. 모든 칸을 채워 숫자와 마릿수가 모두 맞으면 성공입니다.",
      ),
    ) +
    part(
      "괴물과 거울",
      table(
        ["유령", "거울에 반사해야만 보입니다. 직접 보이지 않습니다."],
        ["뱀파이어", "거울에 비치지 않습니다. 직접 봐야만 볼 수 있습니다."],
        ["좀비", "거울에 반사해서도 보이고, 직접 봐도 보입니다."],
        ["거울", "칸을 비스듬히 가로지르는 양면 거울입니다. 시선이 90도 꺾입니다. 거울 칸에는 괴물이 없습니다."],
        ["두 번 보이기", "꺾인 시선이 같은 칸을 두 번 지나가면 그 괴물은 두 번 셉니다."],
      ),
    ) +
    part("처음이라면", notes("<b>0</b>이 적힌 줄부터 보세요. 거울 전에는 뱀파이어도 좀비도 없고, 거울 뒤에는 유령도 좀비도 없습니다.", "거울을 하나도 지나지 않는 줄에는 유령이 보이지 않습니다. 그 줄의 숫자는 뱀파이어와 좀비만 센 것입니다.", "숫자가 그 줄의 칸 수와 같으면, 거울 앞 칸은 유령이 아니고 거울 뒤 칸은 뱀파이어가 아닙니다.")),
  help: "마우스·터치: 판 앞의 괴물을 칸으로 끌어다 놓습니다. 놓은 괴물은 옮기거나 판 밖으로 끌어내 치웁니다<br>키보드: 방향키로 칸을 고르고 Enter를 누를 때마다 유령 → 뱀파이어 → 좀비 → 빈 칸",
  sides: ["나", ""],
  startWord: "유령의 집에 들어가기",
};
