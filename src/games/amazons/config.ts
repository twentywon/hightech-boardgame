import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { N, amazons, type State } from "./rules";
import { AMAZON_COLORS, AmazonsView, squareAt } from "./view";

export const amazonsConfig: PointConfig<State> = {
  game: amazons,
  contact: (sound) => sound.wood(1),
  noPanel: true,
  view: (host, quality) => new AmazonsView(host, quality),
  colors: AMAZON_COLORS,
  keyPoints: () => Array.from({ length: N * N }, (_, s) => squareAt(s)),
  showMovable: false,
  extraHint: "화살을 쏠 칸을 고르세요. 아마존이 내려선 칸에서 퀸처럼 쏩니다.",
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  name: "아마존스",
  english: "Game of the Amazons",
  number: "NO. 59 — MOVE, THEN SHOOT",
  intro: `<p>10×10 판 위의 아마존 여덟 명.<br>퀸처럼 움직인 뒤 화살을 쏘아 칸을 막습니다. 판은 점점 좁아지고, 먼저 움직일 곳이 없어지는 쪽이 집니다.</p>`,
  meta: "2인 · 10×10 · 아마존 4개씩",
  art: `<div class="pg-mini checkers">${"<i></i>".repeat(4)}</div><span>MOVE, THEN SHOOT</span>`,
  artClass: "checkers-art",
  artLabel: "아마존스 판 미리보기",
  tableLabel: "THE AMAZONS",
  tableNote: () => "10 × 10 · 흰색 선공",
  rulesTitle: "움직이고, 쏘아서 가두기",
  rules:
    part(
      "기본 규칙",
      steps(
        "흰 아마존 넷과 검은 아마존 넷으로 시작합니다. <b>흰색이 먼저</b> 둡니다.",
        "내 차례에는 아마존 하나를 체스의 <b>퀸처럼</b>(가로·세로·대각선으로 원하는 만큼) 움직입니다. 다른 말이나 막힌 칸은 넘지 못합니다.",
        "이어서 그 아마존이 내려선 칸에서 <b>화살</b>을 퀸처럼 쏩니다. 화살이 떨어진 칸은 끝까지 <b>막힙니다</b>.",
        "잡는 수는 없습니다. 자기 차례에 움직일 수 없는 쪽이 <b>집니다</b>.",
      ),
    ) +
    part("고르는 차례", table(["1. 아마존", "움직일 내 아마존을 누릅니다."], ["2. 갈 칸", "금색 고리가 뜬 칸 중 하나를 누릅니다."], ["3. 화살", "다시 금색 고리가 뜬 칸 중 화살을 쏠 칸을 누릅니다. 아마존이 떠난 칸에도 쏠 수 있습니다."])) +
    part("처음이라면", notes("판의 넓은 쪽을 차지하는 싸움입니다. 내 아마존이 먼저 닿을 수 있는 칸이 내 땅입니다.", "상대 아마존 바로 옆에 화살을 쏘아 길을 막습니다.", "아마존 하나가 좁은 곳에 갇히면 그 아마존은 거의 쓸모가 없어집니다.")),
  sides: ["흰색", "검은색"],
  startWord: "판 앞에 앉기",
};
