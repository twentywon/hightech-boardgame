import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { LIMIT, tafl, type State } from "./rules";
import { DEFENDER, RAIDER, taflBoard } from "./board";

export const taflConfig: PointConfig<State> = {
  game: tafl,
  contact: (sound) => sound.wood(2),
  noPanel: true,
  board: taflBoard,
  showMovable: false,
  variants: [
    { value: "defenders", label: "왕과 방어 (13개)" },
    { value: "attackers", label: "공격 (24개)" },
  ],
  variantLabel: "내 말 (컴퓨터 대전)",
  sidesOf: (variant) => (variant === "attackers" ? ["공격", "방어"] : ["방어", "공격"]),
  colorsOf: (variant) => (variant === "attackers" ? [RAIDER, DEFENDER] : [DEFENDER, RAIDER]),
  firstNote: "공격이 먼저 둡니다. 방어를 고르면 컴퓨터가 먼저 움직입니다.",
  cheer: (before, state, mode) => {
    const last = state.last;
    if (!last || last === before.last || !last.taken.length) return null;
    // 잡혔다! when the computer has taken mine.
    return mode === "ai" && state.turn === 0 ? "잡혔다!" : "잡았다!";
  },
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  name: "바이킹 체스",
  english: "Hnefatafl",
  number: "NO. 55 — THE KING'S TABLE",
  intro: `<p>바이킹이 즐기던 보드게임, 흐네파타플.<br>가운데 왕과 방어 열두 명을 공격 스물네 명이 둘러쌉니다. 왕은 귀퉁이로 빠져나가면 이깁니다.</p>`,
  meta: "2인 · 11×11 · 공격 24 대 왕과 방어 13",
  art: `<div class="pg-mini checkers">${"<i></i>".repeat(4)}</div><span>ESCAPE TO A CORNER</span>`,
  artClass: "checkers-art",
  artLabel: "바이킹 체스 판 미리보기",
  tableLabel: "THE KING'S TABLE",
  tableNote: () => "11 × 11 · 공격 선공",
  rulesTitle: "왕을 귀퉁이로, 혹은 왕을 사로잡기",
  rules:
    part(
      "기본 규칙",
      steps(
        "11×11 판의 가운데 <b>왕좌</b>에 왕이, 그 둘레에 방어 12개가, 네 변에 공격 24개가 섭니다.",
        "<b>공격이 먼저</b> 두고 번갈아 말 하나를 움직입니다. 모든 말은 장기의 차처럼 <b>가로나 세로로 원하는 만큼</b> 가고, 다른 말을 뛰어넘지 못합니다.",
        "왕좌와 네 귀퉁이에는 <b>왕만</b> 설 수 있습니다.",
      ),
    ) +
    part(
      "잡기",
      table(
        ["끼워 잡기", "움직인 말과 내 다른 말 사이에 상대 말 하나가 가로나 세로로 <b>끼면</b> 잡힙니다. 내가 끼어든 자리로 들어가는 것은 잡히지 않습니다."],
        ["귀퉁이와 왕좌", "귀퉁이와 비어 있는 왕좌는 양쪽 모두에게 적처럼 쓰입니다. 그 옆의 말은 반대쪽에서만 막아도 잡힙니다."],
        ["왕", "왕도 끼워 잡기에 함께합니다. 왕은 <b>네 방향 모두</b>(또는 셋과 왕좌)가 공격 말에 막혀야 잡힙니다. 가장자리의 왕은 잡히지 않습니다."],
      ),
    ) +
    part("승부", table(["방어의 승리", "왕이 네 귀퉁이 중 하나에 닿습니다."], ["공격의 승리", "왕을 사로잡습니다."], ["그 밖", `움직일 수 없는 쪽이 집니다. ${LIMIT}수가 지나면 비깁니다.`])) +
    part("처음이라면", notes("방어는 왕 앞의 길을 열어 두 귀퉁이를 동시에 노리면 막기 어렵습니다.", "공격은 귀퉁이 둘레를 먼저 막고 천천히 조여 갑니다.", "말이 가장자리에 붙으면 한쪽이 막혀 있어 잡히기 쉽습니다.")),
  sides: ["방어", "공격"],
  startWord: "판 앞에 앉기",
};
