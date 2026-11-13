import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DOWN, DROP, GOAL, LEFT, RIGHT, TURN, blocks, level, type State } from "./rules";
import { BLOCK_COLORS, BlocksView } from "./view";

const KEYS: Record<string, number> = { ArrowLeft: LEFT, ArrowRight: RIGHT, ArrowUp: TURN, ArrowDown: DOWN, " ": DROP };
const stat = (label: string, value: number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
export const blocksConfig: PointConfig<State> = {
  game: blocks,
  solo: true,
  live: true,
  noUndo: true,
  view: (host, quality) => new BlocksView(host, quality),
  colors: BLOCK_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: KEYS[key], extra: -1 } : null),
  tallyHtml: (state) => [stat("점수", state.score) + stat("지운 줄", state.lines) + stat("레벨", level(state)), ""],
  // A block set down on the heap; a row taken out rings.
  contact: (sound, state) => (state.last?.cleared.length ? sound.sparkle() : sound.tap()),
  tools: [
    { label: "←", point: LEFT, show: (state) => state.winner === null },
    { label: "→", point: RIGHT, show: (state) => state.winner === null },
    { label: "돌리기", point: TURN, show: (state) => state.winner === null },
    { label: "↓", point: DOWN },
    { label: "떨어뜨리기", point: DROP },
  ],
  name: "블록 내리기",
  english: "Falling Blocks",
  number: "NO. 35 — FILL THE ROW",
  intro: `<p>네 칸짜리 블록이 하나씩 내려옵니다.<br>'테트리스'로 널리 알려진 방식입니다. 틈 없이 쌓아 가로줄을 채우면 그 줄이 사라집니다.</p>`,
  meta: "1인 · 가로 10칸 · 블록 일곱 가지",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FILL THE ROW</span>`,
  artClass: "hexa-art",
  artLabel: "블록 내리기 미리보기",
  tableLabel: "THE WELL",
  tableNote: () => "가로 10칸 · 세로 18칸",
  rulesTitle: "가로줄을 채워 지우세요",
  rules:
    part("기본 규칙", steps("가로 10칸, 세로 18칸의 통 <b>위에서</b> 네 칸짜리 블록이 하나씩 나와 <b>아래로 내려옵니다</b>.", "내려오는 동안 블록을 좌우로 옮기고 돌려서 자리를 잡습니다.", "더 내려갈 수 없으면 그 자리에 굳고 다음 블록이 나옵니다.", "<b>가로 한 줄이 빈칸 없이 차면 그 줄이 사라지고</b> 위에 쌓인 것이 내려옵니다.", "열 줄을 지울 때마다 레벨이 오르고 블록이 더 빨리 내려옵니다.", "새 블록이 나올 자리가 없으면 끝납니다.")) +
    part("움직이기", table(["옮기기", "판 위에서 좌우로 끌거나 ← → 버튼·방향키를 누릅니다."], ["돌리기", "판을 한 번 톡 누르거나 돌리기 버튼, ↑ 키를 누릅니다. 벽이나 쌓인 블록에 걸리면 옆으로 한두 칸 비켜서 돕니다."], ["한 칸 내리기", "아래로 천천히 끌거나 ↓ 버튼·키를 누릅니다."], ["떨어뜨리기", "아래로 빠르게 튕기거나 떨어뜨리기 버튼, 스페이스 키를 누릅니다. 흰 테두리가 떨어질 자리입니다."], ["다음 블록", "통 오른쪽 위 '다음' 칸에 다음에 나올 블록이 보입니다."])) +
    part("점수", table(["한 줄", "100 × 레벨"], ["두 줄", "300 × 레벨"], ["세 줄", "500 × 레벨"], ["네 줄", "800 × 레벨"], ["내리기", "손으로 한 칸 내리면 1점, 떨어뜨리면 떨어진 칸마다 2점."], ["결과", `끝났을 때 ${GOAL}줄 이상 지웠으면 성공으로 칩니다.`])) +
    part("처음이라면", notes("바닥을 평평하게 쌓습니다. 구멍이 생기면 그 줄은 위를 걷어 내기 전에는 지울 수 없습니다.", "한쪽 끝 한 칸을 비워 두고 쌓다가 긴 막대로 네 줄을 한 번에 지우면 점수가 큽니다.", "다음 블록을 보고 지금 블록을 어디에 둘지 정합니다.")),
  help: "마우스·터치: 좌우로 끌어 옮기고, 톡 눌러 돌리고, 아래로 튕겨 떨어뜨립니다<br>키보드: ← → 옮기기, ↑ 돌리기, ↓ 내리기, 스페이스 떨어뜨리기",
  sides: ["나", ""],
  startWord: "블록 꺼내기",
};
