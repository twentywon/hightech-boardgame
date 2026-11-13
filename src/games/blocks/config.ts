import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DOWN, DROP, GOAL, LEFT, RIGHT, START_LEVELS, TOP_SPEED, TURN, blocks, interval, level, risePeriod, type State } from "./rules";
import { BLOCK_COLORS, BlocksView } from "./view";

const KEYS: Record<string, number> = { ArrowLeft: LEFT, ArrowRight: RIGHT, ArrowUp: TURN, ArrowDown: DOWN, " ": DROP };
const stat = (label: string, value: number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a level: a gauge of how fast the pieces fall, and from the fifth level the rubble that comes up. */
function levelArt(lv: number) {
  const bars = Array.from({ length: TOP_SPEED }, (_, i) => `<rect x="${22 + i * 20}" y="${78 - i * 10}" width="14" height="${20 + i * 10}" rx="3" fill="${i < Math.min(lv, TOP_SPEED) ? "#e0a92a" : "#4a5a66"}"/>`).join(""),
    rubble = lv >= TOP_SPEED ? Array.from({ length: Math.min(3, lv - TOP_SPEED + 1) }, (_, r) => Array.from({ length: 7 }, (_, x) => ((x + r * 3) % 7 === 2 ? "" : `<rect x="${17 + x * 15.4}" y="${119 - r * 9}" width="13.4" height="7.4" rx="1.5" fill="#9aa0a7"/>`)).join("")).join("") : "";
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#273540"/><text x="70" y="42" text-anchor="middle" font-size="30" font-weight="800" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">${lv}</text>${bars}${rubble}</svg>`;
}
export const blocksConfig: PointConfig<State> = {
  game: blocks,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  view: (host, quality) => new BlocksView(host, quality),
  colors: BLOCK_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: KEYS[key], extra: -1 } : null),
  tallyHtml: (state) => [stat("점수", state.score) + stat("지운 줄", state.lines) + stat("레벨", level(state)), ""],
  // A block set down on the heap; a row taken out rings.
  contact: (sound, state) => (state.last?.cleared.length ? sound.sparkle() : sound.tap()),
  // The arrow keys of a keyboard at the lower left (up turns the piece), and the drop beside them.
  toolsLayout: "arrows",
  tools: [
    { label: "↑", name: "돌리기", point: TURN, area: "up", show: (state) => state.winner === null },
    { label: "←", name: "왼쪽", point: LEFT, area: "left", show: (state) => state.winner === null },
    { label: "↓", name: "한 칸 내리기", point: DOWN, area: "down" },
    { label: "→", name: "오른쪽", point: RIGHT, area: "right", show: (state) => state.winner === null },
    { label: "내리기", name: "떨어뜨리기", point: DROP, area: "drop" },
  ],
  // 새 게임 asks which level to begin at.
  stages: Array.from({ length: START_LEVELS }, (_, i) => i + 1).map((lv) => ({ value: String(lv), name: `레벨 ${lv}`, note: lv < TOP_SPEED ? `낙하 ${(interval(lv) / 1000).toFixed(2)}초` : `돌무더기 ${risePeriod(lv)}개마다`, art: levelArt(lv) })),
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
    part("기본 규칙", steps("가로 10칸, 세로 18칸의 통 <b>위에서</b> 네 칸짜리 블록이 하나씩 나와 <b>아래로 내려옵니다</b>.", "내려오는 동안 블록을 좌우로 옮기고 돌려서 자리를 잡습니다.", "더 내려갈 수 없으면 그 자리에 굳고 다음 블록이 나옵니다.", "<b>가로 한 줄이 빈칸 없이 차면 그 줄이 사라지고</b> 위에 쌓인 것이 내려옵니다.", "열 줄을 지울 때마다 레벨이 오르고 블록이 더 빨리 내려옵니다. <b>5레벨부터는 더 빨라지지 않습니다.</b>", "대신 5레벨부터는 블록 몇 개를 놓을 때마다 <b>바닥에서 회색 돌무더기 한 줄이 올라옵니다</b>. 줄마다 빈칸이 한 곳 있고, 레벨이 오를수록 더 자주 올라옵니다.", "새 블록이 나올 자리가 없으면 끝납니다.")) +
    part("움직이기", table(["옮기기", "판 위에서 좌우로 끌거나 ← → 버튼·방향키를 누릅니다. 버튼은 판 왼쪽 아래에 키보드 화살표 모양으로 놓여 있습니다."], ["돌리기", "판을 한 번 톡 누르거나 ↑ 버튼·키를 누릅니다. 벽이나 쌓인 블록에 걸리면 옆으로 한두 칸 비켜서 돕니다."], ["한 칸 내리기", "아래로 천천히 끌거나 ↓ 버튼·키를 누릅니다."], ["떨어뜨리기", "아래로 빠르게 튕기거나 화살표 오른쪽의 <b>내리기</b> 버튼, 스페이스 키를 누릅니다. 흰 테두리가 떨어질 자리입니다."], ["다음 블록", "통 오른쪽 위 '다음' 칸에 다음에 나올 블록이 보입니다."])) +
    part("레벨", table(["1–4레벨", "레벨마다 블록이 빨라집니다."], ["5레벨부터", "속도는 그대로이고, 바닥에서 돌무더기가 올라옵니다. 5레벨은 블록 7개마다 한 줄, 그 뒤로 레벨마다 하나씩 줄어 3개마다 한 줄까지 잦아집니다."], ["돌무더기", "빈칸 자리에 블록을 끼워 그 줄을 채우면 다른 줄처럼 지워집니다."], ["시작 레벨", "<b>새 게임</b>을 누르면 시작할 레벨을 고를 수 있습니다."])) +
    part("점수", table(["한 줄", "100 × 레벨"], ["두 줄", "300 × 레벨"], ["세 줄", "500 × 레벨"], ["네 줄", "800 × 레벨"], ["내리기", "손으로 한 칸 내리면 1점, 떨어뜨리면 떨어진 칸마다 2점."], ["결과", `끝났을 때 ${GOAL}줄 이상 지웠으면 성공으로 칩니다.`])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다. 화면이 어두워집니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누르면 멈춘 자리에서 이어집니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("바닥을 평평하게 쌓습니다. 구멍이 생기면 그 줄은 위를 걷어 내기 전에는 지울 수 없습니다.", "한쪽 끝 한 칸을 비워 두고 쌓다가 긴 막대로 네 줄을 한 번에 지우면 점수가 큽니다.", "다음 블록을 보고 지금 블록을 어디에 둘지 정합니다.")),
  help: "마우스·터치: 좌우로 끌어 옮기고, 톡 눌러 돌리고, 아래로 튕겨 떨어뜨립니다<br>키보드: ← → 옮기기, ↑ 돌리기, ↓ 내리기, 스페이스 떨어뜨리기",
  sides: ["나", ""],
  startWord: "블록 꺼내기",
};
