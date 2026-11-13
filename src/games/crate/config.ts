import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { crate, type State } from "./rules";
import { CRATE_COLORS, CrateView } from "./view";

const KEYS: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
const COUNTS: [number, string][] = [[2, "쉬움"], [3, "보통"], [4, "어려움"], [5, "아주 어려움"]];
/** A small picture of a stage: its number of crates. The warehouse itself is laid out anew every time. */
function countArt(count: number) {
  const crates = Array.from({ length: count }, (_, i) => {
    const x = 20 + (i % 3) * 36,
      y = 26 + Math.floor(i / 3) * 44;
    return `<rect x="${x}" y="${y}" width="30" height="30" fill="#c9884a" stroke="#6b4423" stroke-width="3"/><path d="M${x + 3} ${y + 3} l24 24 M${x + 27} ${y + 3} l-24 24" stroke="#8a5a2b" stroke-width="3"/>`;
  }).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="6" y="6" width="128" height="128" fill="#d8c39a" stroke="#4f3424" stroke-width="6"/>${crates}</svg>`;
}
export const crateConfig: PointConfig<State> = {
  game: crate,
  solo: true,
  noPanel: true,
  view: (host, quality) => new CrateView(host, quality),
  colors: CRATE_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: KEYS[key], extra: -1 } : null),
  // A crate scraping over the planks.
  contact: (sound) => sound.tap(),
  toolsLayout: "arrows",
  tools: [
    { label: "↑", name: "위로", point: 0, area: "up", show: (state) => state.winner === null },
    { label: "←", name: "왼쪽으로", point: 3, area: "left", show: (state) => state.winner === null },
    { label: "↓", name: "아래로", point: 2, area: "down", show: (state) => state.winner === null },
    { label: "→", name: "오른쪽으로", point: 1, area: "right", show: (state) => state.winner === null },
  ],
  stages: COUNTS.map(([count, name]) => ({ value: String(count), name, note: `상자 ${count}개`, art: countArt(count) })),
  name: "창고지기",
  english: "Warehouse Keeper",
  number: "NO. 41 — PUSH, NEVER PULL",
  intro: `<p>도트로 그린 작은 창고.<br>'소코반'으로 알려진 상자 밀기 퍼즐입니다. 상자를 밀어 초록 표시 위에 모두 올리세요. 창고는 할 때마다 새로 만들어집니다.</p>`,
  meta: "1인 · 9×8 · 창고는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PUSH, NEVER PULL</span>`,
  artClass: "morris-art",
  artLabel: "창고지기 미리보기",
  tableLabel: "THE WAREHOUSE",
  tableNote: (variant) => `상자 ${Number(variant) || 3}개 · 무작위 창고`,
  rulesTitle: "밀 수만 있고, 당길 수는 없습니다",
  rules:
    part("기본 규칙", steps("창고지기는 위·아래·왼쪽·오른쪽으로 <b>한 칸씩</b> 걷습니다.", "가는 쪽에 상자가 있으면 <b>상자를 한 칸 밉니다</b>. 상자 너머가 벽이거나 다른 상자면 밀 수 없습니다.", "상자는 <b>밀 수만 있고 당길 수는 없습니다</b>. 두 개를 한꺼번에 밀 수도 없습니다.", "상자를 모두 <b>초록 표시</b> 위에 올리면 성공입니다. 제자리에 놓인 상자는 초록색이 됩니다.")) +
    part("움직이기", table(["방향", "방향키, 판 왼쪽 아래의 화살표 버튼, 또는 판 위를 가고 싶은 쪽으로 쓸어 줍니다."], ["무르기", "화살표 옆의 무르기 버튼으로 한 걸음씩 되돌립니다. 처음까지 되돌릴 수 있습니다."], ["막혔을 때", "상자가 구석에 박히면 다시 꺼낼 수 없습니다. 무르기로 되돌리거나 새 게임을 시작합니다."])) +
    part("창고와 단계", table(["무작위 창고", "창고의 모양과 상자 자리는 할 때마다 새로 만들어집니다. 다 놓인 상태에서 거꾸로 끌어내며 만들기 때문에 <b>반드시 풀 수 있습니다</b>."], ["단계", "<b>새 게임</b>을 누르면 상자 수를 고릅니다. 2개(쉬움)부터 5개(아주 어려움)까지입니다."])) +
    part("처음이라면", notes("상자를 <b>구석</b>이나 <b>벽에 붙여</b> 밀면 다시 떼어 낼 수 없는 경우가 많습니다. 밀기 전에 그 뒤를 생각합니다.", "먼 표시부터 채웁니다. 가까운 표시를 먼저 채우면 길이 막힐 수 있습니다.", "상자를 밀려면 그 반대편에 설 수 있어야 합니다. 돌아갈 길이 있는지 먼저 봅니다.")),
  help: "키보드: 방향키 · 터치: 가고 싶은 쪽으로 쓸거나 화살표 버튼",
  sides: ["나", ""],
  startWord: "창고에 들어가기",
};
