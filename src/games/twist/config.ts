import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { twist, type State } from "./rules";
import { MARBLE_COLORS, TwistView, twistPoints } from "./view";

export const twistConfig: PointConfig<State> = {
  game: twist,
  view: (host, quality) => new TwistView(host, quality),
  colors: MARBLE_COLORS,
  keyPoints: twistPoints,
  keyStart: () => 14,
  extraHint: "돌릴 판과 방향을 고르세요.",
  name: "돌림 오목",
  english: "Twist Five",
  number: "NO. 22 — PLACE AND TURN",
  intro: `<p>흔히 '펜타고'로 알려진 놀이 방식입니다. 구슬을 하나 놓고, 네 조각 가운데 하나를 돌립니다.<br>돌린 뒤에 다섯이 이어지면 이깁니다.</p><ul class="rule-list"><li>6×6 판은 3×3 조각 넷으로 되어 있습니다</li><li>놓은 뒤 조각 하나를 90° 돌립니다</li><li>가로·세로·대각선 다섯이면 승리</li></ul>`,
  meta: "2인 · 6×6 · 조각 넷",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PLACE, THEN TURN</span>`,
  artClass: "twist-art",
  artLabel: "돌림 오목 판 미리보기",
  tableLabel: "THE DESK",
  tableNote: () => "6 × 6 · 검정 선공",
  rulesTitle: "놓고, 돌리고, 다섯을 이으세요",
  rules:
    part("기본 규칙", steps("6×6 판은 3×3짜리 <b>조각 넷</b>으로 되어 있습니다. <b>검정이 먼저</b> 둡니다.", "차례마다 먼저 빈칸에 <b>구슬 하나</b>를 놓습니다.", "그다음 조각 하나를 골라 <b>시계 방향이나 반시계 방향으로 90°</b> 돌립니다. 반드시 돌려야 합니다.", "돌린 뒤에 내 구슬 <b>다섯이 가로·세로·대각선 한 줄</b>로 이어져 있으면 이깁니다.")) +
    part("승부", table(["놓자마자 다섯", "구슬을 놓은 것만으로 다섯이 되면 돌리지 않고 이깁니다."], ["양쪽 모두 다섯", "돌린 결과 두 사람 모두 다섯이 되면 무승부입니다."], ["상대만 다섯", "내가 돌려서 상대의 다섯이 완성되면 상대가 이깁니다."], ["가득 참", "36칸이 모두 찰 때까지 승부가 나지 않으면 무승부입니다."])) +
    part("처음이라면", notes("조각의 <b>가운데 칸</b>은 돌려도 자리가 바뀌지 않습니다. 가장 든든한 자리입니다.", "넷을 만들면 상대는 막거나 돌려서 끊어야 합니다. 돌려도 이어지는 넷이 강합니다.", "상대 구슬이 셋 이상 놓인 조각은 돌렸을 때 어디로 이어지는지 미리 봅니다.", "빈 조각을 돌리면 판이 그대로입니다. 차례를 넘기고 싶을 때 씁니다.")) +
    part("그 밖에", notes("새 게임 설정에서 대전 방식과 컴퓨터 난이도(쉬움·보통·어려움)를 고릅니다.", "<b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  help: "마우스·터치: 빈칸을 누른 뒤 판 옆의 노란 화살표를 누릅니다<br>키보드: 판을 선택하고 방향키·Enter, Escape로 취소",
  sides: ["검정", "하양"],
  startWord: "책상에 앉기",
};
