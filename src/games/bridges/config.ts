import { part, steps, notes } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STAGES, bridges, hint, setOf, type State } from "./rules";
import { BRIDGES_COLORS, BridgesView } from "./view";

/**
 * A small picture of a stage: a lagoon with a few islands joined by bridges, single and double, laid on a grid of
 * the stage's size (the same islands for every stage, drawn smaller as the grid grows).
 */
function lagoonArt(size: number) {
  const cell = 104 / size,
    x0 = 18,
    at = (r: number, c: number) => [x0 + (Math.round((c * (size - 1)) / 6) + 0.5) * cell, x0 + (Math.round((r * (size - 1)) / 6) + 0.5) * cell],
    islands: [number, number][] = [[0, 0], [0, 4], [2, 0], [2, 2], [2, 5], [4, 2], [4, 5], [6, 0], [6, 5]],
    links: [number, number, number][] = [[0, 1, 1], [0, 2, 2], [2, 3, 1], [3, 4, 1], [3, 5, 2], [4, 6, 2], [5, 6, 1], [6, 8, 1], [2, 7, 1], [7, 8, 2]];
  let dots = "",
    spans = "",
    land = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) dots += `<circle cx="${x0 + (c + 0.5) * cell}" cy="${x0 + (r + 0.5) * cell}" r="${Math.max(0.8, cell * 0.06)}" fill="#ffffff" opacity="0.35"/>`;
  for (const [a, b, count] of links) {
    const [x1, y1] = at(...islands[a]),
      [x2, y2] = at(...islands[b]),
      across = y1 === y2,
      gap = count === 2 ? cell * 0.13 : 0,
      width = count === 2 ? cell * 0.12 : cell * 0.18;
    for (const side of count === 2 ? [-1, 1] : [0]) {
      const dx = across ? 0 : side * gap,
        dy = across ? side * gap : 0;
      spans += `<line x1="${x1 + dx}" y1="${y1 + dy}" x2="${x2 + dx}" y2="${y2 + dy}" stroke="#8a5a32" stroke-width="${width}"/>`;
    }
  }
  for (const [r, c] of islands) {
    const [x, y] = at(r, c);
    land += `<circle cx="${x}" cy="${y}" r="${cell * 0.44}" fill="#e7cf98"/><circle cx="${x}" cy="${y}" r="${cell * 0.31}" fill="#5c9c43"/><circle cx="${x}" cy="${y}" r="${cell * 0.19}" fill="#f7f0dc"/>`;
  }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#1b5c86"/><rect x="13" y="13" width="114" height="114" rx="10" fill="#45b8cc"/>${dots}${spans}${land}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
/** What a hint asks for, by the count it puts between the two islands it marks. */
function hintText(state: State, move: { from: number; to: number; extra: number }) {
  const setting = setOf(move);
  if (!setting) return "힌트 — 금색 고리가 쳐진 두 섬을 보세요.";
  const now = state.bridges[setting.edge] ?? 0;
  if (setting.count === 0) return "힌트 — 금색 고리가 쳐진 두 섬 사이에는 다리가 없어야 합니다. 놓인 다리를 걷으세요.";
  if (setting.count < now) return "힌트 — 금색 고리가 쳐진 두 섬 사이의 다리는 하나여야 합니다.";
  return setting.count === 2
    ? "힌트 — 금색 고리가 쳐진 두 섬 사이에 다리를 두 개 놓으세요."
    : "힌트 — 금색 고리가 쳐진 두 섬 사이에 다리를 하나 놓으세요.";
}
export const bridgesConfig: PointConfig<State> = {
  game: bridges,
  contact: (sound) => sound.knock(3),
  solo: true,
  showMovable: false,
  view: (host, quality) => new BridgesView(host, quality),
  colors: BRIDGES_COLORS,
  // The keyboard walks from island to island: the cells of the sea have no place, so the arrows pass over them.
  keyPoints: (state) => {
    const land = new Set(state.islands.map((island) => island.cell));
    return Array.from({ length: state.size * state.size }, (_, i) => (land.has(i) ? { x: i % state.size, z: Math.floor(i / state.size) } : { x: NaN, z: NaN }));
  },
  keyStart: (state) => state.islands[0]?.cell ?? 0,
  puzzle: { hint, hintText },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: `섬 ${stage.islands}개`, art: lagoonArt(stage.size) })),
  tallyHtml: () => ["", ""],
  name: "하시",
  english: "Hashi",
  number: "NO. 73 — LINK EVERY ISLAND",
  intro: `<p>푸른 바다에 흩어진 작은 섬들.<br>섬에 적힌 숫자만큼 다리를 놓아 모든 섬을 하나로 이으세요. 'Hashiwokakero'로 알려진 오래된 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 7×7부터 12×12 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LINK EVERY ISLAND</span>`,
  artClass: "morris-art",
  artLabel: "하시 미리보기",
  tableLabel: "THE LAGOON",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 섬 ${stage.islands}개 · 무작위 문제`;
  },
  rulesTitle: "섬의 숫자만큼 다리를 놓으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "바다에 숫자가 적힌 <b>섬</b>들이 있습니다. 섬과 섬 사이에 <b>다리</b>를 놓아 모든 섬을 잇습니다.",
        "다리는 <b>가로나 세로로 곧게</b>, 사이에 다른 섬이 없는 두 섬 사이에만 놓입니다. 두 섬 사이에는 다리를 <b>두 개까지</b> 놓을 수 있습니다.",
        "다리는 <b>다른 다리와 엇갈리지 않고</b>, 섬 위를 지나가지도 않습니다.",
        "섬의 숫자는 그 섬에 닿는 <b>다리의 수</b>입니다. 두 개를 놓은 곳은 둘로 셉니다.",
        "섬을 누르고 이웃한 섬을 누르거나, 섬에서 이웃한 섬으로 끌어 놓으면 그 사이의 다리가 하나 → 둘 → 없음으로 바뀝니다. 모든 섬에 숫자만큼 다리가 놓이고 모든 섬이 <b>하나로 이어지면</b> 성공입니다.",
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "이웃이 네 방향에 있는 <b>8</b>, 세 방향뿐인 <b>6</b>, 두 방향뿐인 <b>4</b>는 모든 쪽에 다리가 두 개씩입니다.",
        "<b>1</b>과 <b>1</b>을 잇거나 <b>2</b>와 <b>2</b>를 두 개로 이으면 둘만 따로 떨어집니다. 섬이 더 있으면 그렇게 이을 수 없습니다.",
        "섬의 숫자판은 다리가 숫자만큼 놓이면 초록, 넘치면 빨강으로 바뀝니다.",
      ),
    ),
  help: "마우스·터치: 섬을 누른 뒤 이웃한 섬을 누르거나, 섬에서 이웃한 섬으로 끌어 놓습니다<br>키보드: 방향키로 섬을 고르고 Enter, Escape로 취소",
  sides: ["나", ""],
  startWord: "섬에 들어가기",
};
