import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { H, W, marble, type State } from "./rules";
import { MARBLE_COLORS, MarbleView } from "./view";

const SIZES: [number, string][] = [[4, "아주 쉬움"], [6, "쉬움"], [8, "보통"], [10, "어려움"], [12, "아주 어려움"]];
/** A small picture of a stage: its number of marbles. The tray itself is laid anew every time. */
function sizeArt(size: number) {
  const dots = Array.from({ length: size }, (_, i) => {
    const x = 28 + (i % 4) * 28,
      y = 34 + Math.floor(i / 4) * 28;
    return `<circle cx="${x}" cy="${y}" r="10" fill="#e6f1ee" stroke="#2f9f8f" stroke-width="3"/><path d="M${x - 6} ${y + 2} q6 -9 12 -3" fill="none" stroke="#e0a92a" stroke-width="3"/>`;
  }).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#c99a5e" stroke="#8a5a2b" stroke-width="3"/>${dots}</svg>`;
}
export const marbleConfig: PointConfig<State> = {
  game: marble,
  solo: true,
  noPanel: true,
  showMovable: false,
  view: (host, quality) => new MarbleView(host, quality),
  colors: MARBLE_COLORS,
  keyPoints: () => Array.from({ length: W * H }, (_, i) => ({ x: (i % W) - (W - 1) / 2, z: Math.floor(i / W) - (H - 1) / 2 })),
  // Glass against glass.
  contact: (sound) => sound.plastic(),
  stages: SIZES.map(([size, name]) => ({ value: String(size), name, note: `구슬 ${size}개`, art: sizeArt(size) })),
  name: "구슬치기",
  english: "Marble Shot",
  number: "NO. 40 — KNOCK THEM OFF",
  intro: `<p>나무 쟁반 위의 유리구슬들.<br>구슬로 구슬을 쳐서 하나씩 쟁반 밖으로 내보내고, 마지막 한 개만 남기세요. 판은 할 때마다 새로 만들어집니다.</p>`,
  meta: "1인 · 7×8 · 판은 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>KNOCK THEM OFF</span>`,
  artClass: "morris-art",
  artLabel: "구슬치기 쟁반 미리보기",
  tableLabel: "THE MARBLE TRAY",
  tableNote: (variant) => `구슬 ${Number(variant) || 6}개 · 무작위 판`,
  rulesTitle: "쳐서 내보내고 하나만 남기세요",
  rules:
    part("기본 규칙", steps("가로 7칸, 세로 8칸의 쟁반에 구슬 몇 개가 놓여 있습니다.", "구슬 하나를 골라 <b>가로나 세로로</b> 칩니다. 그 줄에 <b>다른 구슬이 있어야</b> 칠 수 있습니다.", "친 구슬은 굴러가서 <b>맞은 구슬 바로 앞에 멈추고</b>, 맞은 구슬이 같은 쪽으로 굴러갑니다.", "굴러간 구슬이 또 다른 구슬을 맞히면 그 구슬이 이어서 굴러갑니다. 맨 끝의 구슬은 <b>쟁반 밖으로 떨어집니다</b>.", "한 번 칠 때마다 구슬이 하나씩 줄어듭니다. <b>하나만 남기면 성공</b>, 더 칠 수 없는데 둘 이상 남으면 실패입니다.")) +
    part("치기", table(["끌어서 치기", "구슬을 누른 채 보낼 쪽으로 끌었다 놓습니다."], ["눌러서 치기", "구슬을 누르면 맞힐 수 있는 구슬에 흰 고리가 생깁니다. 그 구슬을 누르면 그쪽으로 칩니다."], ["바로 옆 구슬", "<b>붙어 있는 구슬은 칠 수 없습니다.</b> 사이에 빈칸이 하나는 있어야 합니다."], ["붙어 있는 줄", "굴러가다 멈춘 구슬 뒤로 구슬들이 붙어 있으면, 힘이 전해져 맨 끝 구슬이 굴러갑니다."], ["무르기", "한 수씩 되돌릴 수 있습니다."])) +
    part("판과 단계", table(["무작위 판", "판은 할 때마다 새로 만들어집니다. 구슬 하나에서 거꾸로 되짚어 만들기 때문에 <b>반드시 풀 수 있습니다</b>."], ["단계", "<b>새 게임</b>을 누르면 구슬 수를 고릅니다. 4개(아주 쉬움)부터 12개(아주 어려움)까지입니다."])) +
    part("처음이라면", notes("치고 나면 친 구슬의 자리가 바뀝니다. 다음에 어느 줄에 서게 되는지를 먼저 봅니다.", "혼자 떨어져서 어느 줄에도 다른 구슬이 없는 구슬은 나중에 쓸 수 없게 됩니다.", "막히면 무르기로 되돌려 다른 순서로 쳐 봅니다.")),
  help: "마우스·터치: 구슬을 누른 채 보낼 쪽으로 끌거나, 구슬을 누른 뒤 맞힐 구슬을 누릅니다<br>키보드: 방향키·Enter, Escape로 취소",
  sides: ["나", ""],
  startWord: "쟁반 앞에 앉기",
};
