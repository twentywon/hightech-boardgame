import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { KEEP, MODES, VANISH_LIMIT, modeOf, tictactoe, type State } from "./rules";
import { cellPos } from "./layout";
import { TTT_COLORS, TicTacToeView } from "./view";

export const tictactoeConfig: PointConfig<State> = {
  game: tictactoe,
  noPanel: true,
  view: (host, quality) => new TicTacToeView(host, quality),
  // The mode is chosen before the game (the user asked for several).
  variants: MODES.map((m) => ({ value: m.value, label: m.label })),
  variantLabel: "모드",
  colors: TTT_COLORS,
  // A glazed mark set down on a wooden board.
  contact: (sound) => sound.tile(3),
  // The keyboard walks the cells (in the cube, layer by layer as they are set back).
  keyPoints: (state) => state.cells.map((_, cell) => ({ x: cellPos(state.mode, cell).x, z: cellPos(state.mode, cell).z - cellPos(state.mode, cell).y * 0.4 })),
  keyStart: (state) => (state.mode === "ultimate" ? 40 : state.mode === "cube" ? 21 : 4),
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  name: "틱택토",
  english: "Tic-Tac-Toe",
  number: "NO. 68 — THREE IN A ROW",
  intro: `<p>X와 O를 번갈아 두어 한 줄을 먼저 만드는 놀이입니다.<br>클래식부터 사라지는 틱택토, 거꾸로 틱택토, 울티밋, 4×4×4 입체까지 다섯 가지 모드가 있습니다.</p>`,
  meta: `2인 · 모드 ${MODES.length}가지`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>THREE IN A ROW</span>`,
  artClass: "fourrow-art",
  artLabel: "틱택토 판 미리보기",
  tableLabel: "THE CAFÉ TABLE",
  tableNote: (variant) => MODES.find((m) => m.value === modeOf(variant))?.label ?? "클래식",
  rulesTitle: "한 줄을 먼저 만드세요",
  rules:
    part("기본 규칙", steps("두 사람이 <b>X</b>(빨강, 먼저)와 <b>O</b>(파랑)를 번갈아 빈칸에 하나씩 둡니다.", "가로·세로·대각선으로 자기 표시를 한 줄 먼저 채우면 이깁니다(거꾸로 틱택토에서는 집니다).", "더 둘 곳이 없도록 승부가 나지 않으면 무승부입니다.", "시작할 때 <b>모드</b>를 고릅니다.")) +
    part(
      "모드",
      table(
        ["클래식", "3×3 판에서 세 줄을 먼저 만들면 이깁니다."],
        ["사라지는 틱택토", `각자 판에 <b>${KEEP}개까지만</b> 둘 수 있습니다. 넷째를 두면 자기 말 가운데 <b>가장 오래된 말이 사라집니다</b>. 다음에 사라질 말은 흐리게 보입니다. ${VANISH_LIMIT}수 안에 승부가 나지 않으면 무승부입니다.`],
        ["거꾸로 틱택토", "세 줄을 <b>만든 쪽이 집니다</b>. 상대가 어쩔 수 없이 줄을 만들게 몰아갑니다."],
        ["울티밋 틱택토", "작은 3×3 판 아홉 개가 큰 판을 이룹니다. 내가 둔 칸의 자리가 <b>상대가 둘 작은 판</b>을 정합니다(오른쪽 위 칸에 두면 상대는 오른쪽 위 판에). 작은 판에서 세 줄을 만들면 그 판을 차지하고, <b>차지한 판 세 개를 한 줄</b>로 만들면 이깁니다. 보낼 판이 이미 끝났으면 아무 판에나 둡니다. 둘 수 있는 판은 금색 테두리로 보입니다."],
        ["입체 틱택토", "4×4 판 네 층으로 된 정육면체입니다. 한 층 안에서는 물론, 층을 건너 세로로, 대각선으로, 모서리에서 모서리까지 어느 방향이든 <b>네 개를 한 줄</b>로 먼저 만들면 이깁니다(줄은 모두 76개)."],
      ),
    ) +
    part("처음이라면", notes("클래식은 서로 실수하지 않으면 무승부입니다. 한가운데나 모서리부터 둡니다.", "상대가 다음 수에 이기는 칸이 있으면 먼저 막습니다. 내가 이길 곳을 두 군데 동시에 만들면 이깁니다.", "울티밋에서는 상대를 이미 끝난 판으로 보내지 않도록 조심합니다. 아무 데나 둘 기회를 주게 됩니다.", "입체 틱택토는 가운데 여덟 칸과 꼭짓점 여덟 칸이 가장 많은 줄에 닿습니다.")),
  help: "마우스·터치: 빈칸을 누릅니다<br>키보드: 방향키로 칸을 고르고 Enter",
  sides: ["X", "O"],
  startWord: "테이블에 앉기",
};
