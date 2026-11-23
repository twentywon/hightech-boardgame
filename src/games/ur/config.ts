import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { THROW, ur, type State } from "./rules";
import { UR_COLORS, UrView, pieceAt, DICE } from "./view";

export const urConfig: PointConfig<State> = {
  game: ur,
  contact: (sound) => sound.stone(3),
  noPanel: true,
  view: (host, quality) => new UrView(host, quality),
  // Over one Wi-Fi each device plays one side; the four dice are thrown by the side to move and fall as the host draws
  // them when it takes the throw (`src/net/random.ts`).
  net: {},
  colors: UR_COLORS,
  keyPoints: (state) => [...state.pieces.flatMap((pieces, side) => pieces.map((progress, k) => pieceAt(side, progress, k))), ...Array(6).fill({ x: NaN, z: NaN }), DICE],
  autoSingle: true,
  cheer: (before, state, mode) =>
    state.last && state.last !== before.last && state.last.sent.length ? (mode === "ai" && state.last.side === 1 ? "잡혔다!" : "잡았다!") : null,
  // A throw cannot be taken back.
  noUndo: true,
  // The dice themselves are tapped: the button is kept for the keyboard only.
  tools: [{ label: "주사위 던지기", point: THROW, onBoard: true }],
  name: "우르 왕실 게임",
  english: "Royal Game of Ur",
  number: "NO. 56 — FOUR THOUSAND YEARS OLD",
  intro: `<p>메소포타미아의 왕릉에서 나온 4,500년 전의 놀이판.<br>사면체 주사위 네 개를 던져 말 일곱 개를 먼저 판 밖으로 내보내세요.</p>`,
  meta: "2인 · 말 7개씩 · 사면체 주사위 4개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>RACE PAST THE ROSETTES</span>`,
  artClass: "ludo-art",
  artLabel: "우르 왕실 게임 판 미리보기",
  tableLabel: "THE ROYAL BOARD",
  tableNote: () => "말 7개씩 · 흰 말 선공",
  rulesTitle: "로제트를 밟으며 먼저 빠져나가기",
  rules:
    part(
      "기본 규칙",
      steps(
        "판은 칸 20개입니다. 각자 말 일곱 개를 판 밖에 두고 시작합니다. <b>흰 말(나)이 먼저</b> 던집니다.",
        "사면체 주사위 네 개를 던져 <b>흰 꼭짓점이 위로 온 개수</b>(0~4)만큼 말 하나를 앞으로 옮깁니다.",
        "말은 내 쪽 줄을 네 칸 지나, 두 사람이 함께 쓰는 <b>가운데 줄 여덟 칸</b>을 지나고, 다시 내 쪽 줄 두 칸을 지나 판 밖으로 나갑니다.",
        "말 일곱 개를 먼저 모두 내보내면 이깁니다.",
      ),
    ) +
    part(
      "칸과 말",
      table(
        ["로제트", "꽃무늬 칸 다섯 개입니다. 로제트에 말을 놓으면 <b>한 번 더</b> 던집니다."],
        ["잡기", "가운데 줄에서 상대 말이 있는 칸에 서면 그 말은 처음으로 돌아갑니다."],
        ["가운데 로제트", "가운데 줄의 로제트에 선 말은 잡히지 않습니다. 그 칸에는 상대가 설 수 없습니다."],
        ["막힘", "내 말이 있는 칸에는 설 수 없습니다. 판 밖으로 나가려면 남은 칸과 <b>딱 맞는 수</b>가 나와야 합니다."],
        ["0이 나오면", "움직일 말이 없으면 그 차례는 넘어갑니다."],
      ),
    ) +
    part("처음이라면", notes("주사위는 2가 가장 자주 나오고(16번에 6번), 0과 4는 드뭅니다(16번에 1번).", "가운데 로제트를 차지하고 오래 버티면 상대의 길이 막힙니다.", "상대 말 바로 뒤 1~3칸은 위험합니다. 잡을 수 있으면 대개 잡습니다.")),
  help: "마우스·터치: 주사위를 누르고, 금색 고리가 뜬 말을 누릅니다",
  sides: ["흰 말", "검은 말"],
  startWord: "판 앞에 앉기",
};
