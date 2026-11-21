import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { chooseMove } from "./ai";
import { pointAt } from "./layout";
import { KOMI, PASS, RESIGN, SIZES, go, points, sizeOf, type State } from "./rules";
import { GO_COLORS, GoView } from "./view";

export const goConfig: PointConfig<State> = {
  // The computer searches the game itself (a tree of random games), in a fixed time whatever the board.
  game: { ...go, choose: (state, level, random) => chooseMove(state, level, random) },
  view: (host, quality, variant) => new GoView(host, quality, sizeOf(variant)),
  variants: SIZES.map((size) => ({ value: String(size), label: `${size}×${size}` })),
  variantLabel: "판 크기",
  colors: GO_COLORS,
  // A stone set down on a wooden board: a recording of its own, which no other game uses.
  contact: (sound) => sound.stone(5),
  keyPoints: (state) => state.cells.map((_, p) => pointAt(state.size, p)),
  keyStart: (state) => (state.cells.length - 1) / 2,
  tools: [
    { label: "한 수 쉬기", point: PASS },
    { label: "기권", point: RESIGN },
  ],
  name: "바둑",
  english: "Go",
  number: "NO. 74 — SURROUND THE LAND",
  intro: `<p>흑과 백이 번갈아 돌을 놓아 더 넓은 집을 짓는 놀이입니다.<br>동네 기원의 바둑판 앞에 앉아 한 판 두어 보세요.</p>`,
  meta: `2인 · 19×19 · 13×13 · 9×9 · 덤 ${points(KOMI)}집`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SURROUND THE LAND</span>`,
  artClass: "morris-art",
  artLabel: "바둑판 미리보기",
  tableLabel: "THE GO PARLOUR",
  tableNote: (variant) => `${sizeOf(variant)}×${sizeOf(variant)} · 덤 ${points(KOMI)}집`,
  rulesTitle: "더 넓은 집을 지으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "흑과 백이 번갈아 판의 <b>빈 교차점</b>에 돌을 하나씩 놓습니다. <b>흑이 먼저</b> 둡니다. 놓은 돌은 옮기지 않습니다.",
        "상하좌우로 이어진 돌은 한 덩어리입니다. 덩어리에 붙은 빈 점(<b>활로</b>)이 모두 막히면 그 돌들을 <b>따내어</b> 판에서 들어냅니다.",
        "놓자마자 제 활로가 없어지는 곳에는 둘 수 없습니다. 다만 그 수로 상대 돌을 따낸다면 둘 수 있습니다.",
        "판이 예전과 똑같은 모양으로 되돌아가는 수는 둘 수 없습니다(<b>패</b>). 다른 곳에 한 수 둔 뒤에는 따낼 수 있습니다.",
        "더 둘 곳이 없으면 <b>한 수 쉬기</b>를 누릅니다. 두 사람이 잇달아 쉬면 대국이 끝나고 <b>계가</b>합니다. <b>기권</b>하면 상대의 불계승입니다.",
        `자기 <b>집</b>과 따낸 돌을 더하고 백은 <b>덤 ${points(KOMI)}집</b>을 더해, 많은 쪽이 이깁니다.`,
      ),
    ) +
    part(
      "용어",
      table(
        ["활로", "돌이나 돌 덩어리에 상하좌우로 붙어 있는 빈 교차점입니다. 활로가 하나만 남은 것을 <b>단수</b>라고 합니다."],
        ["따냄", "상대 돌의 마지막 활로를 막아 들어내는 것입니다. 따낸 돌은 내 바둑돌함의 뒤집은 뚜껑에 담기고, 계가 때 한 개에 한 집씩 칩니다."],
        ["패", "돌 하나를 서로 번갈아 따낼 수 있는 모양입니다. 방금 따낸 돌을 곧바로 되따낼 수는 없고, 다른 곳에 한 수 둔 뒤에야 따낼 수 있습니다. 지금 둘 수 없는 패 자리는 붉은 네모로 보입니다."],
        ["집", "자기 돌로 둘러싼 빈 교차점입니다. 한 점이 한 집입니다."],
        ["계가", "대국이 끝난 뒤 집을 세는 일입니다. 살 수 없는 돌(<b>사석</b>)은 들어내어 따낸 돌에 더합니다. 이 판에서는 끝난 판을 여러 번 끝까지 두어 보고, 대개 상대 차지가 되는 돌을 사석으로 칩니다. 경계가 덜 닫힌 빈 점은 대개 차지하게 되는 쪽의 집으로 셉니다. 사석은 흐리게, 집은 작은 네모로 보입니다."],
        ["덤", `먼저 두는 흑의 이점을 메우려고 백에게 더해 주는 ${points(KOMI)}집입니다. 반 집이 있어 비기는 일이 없습니다.`],
      ),
    ) +
    part(
      "판 크기",
      table(
        ["19×19", "정식 바둑판입니다. 한 판이 길고 깊습니다."],
        ["13×13", "중간 크기 판입니다. 19줄로 가기 전에 연습하기 좋습니다."],
        ["9×9", "작은 판입니다. 한 판이 금방 끝나 처음 배우기에 알맞습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "9×9 판으로 시작해 보세요. 규칙을 익히기에 가장 좋습니다.",
        "귀, 변, 중앙의 순서로 두면 적은 돌로 집을 짓기 쉽습니다.",
        "덩어리 안에 따로 떨어진 집(눈)이 두 개 있으면 그 돌은 결코 잡히지 않습니다.",
        "단수에 몰린 돌은 달아나거나, 버리고 더 큰 곳을 두는 편이 나을 때도 있습니다.",
        "경계를 다 막아 더 둘 곳이 없으면 한 수 쉬기를 누르세요. 상대도 쉬면 계가합니다.",
      ),
    ),
  help: "마우스·터치: 빈 교차점을 누릅니다<br>키보드: 방향키로 점을 고르고 Enter",
  sides: ["흑", "백"],
  startWord: "기원에 들어가기",
};
