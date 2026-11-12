import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { COLS, ROWS, fourRow, type State } from "./rules";
import { DISC_COLORS, FourRowView, cellAt } from "./view";

export const fourRowConfig: PointConfig<State> = {
  game: fourRow,
  view: (host, quality) => new FourRowView(host, quality),
  shape: "tall",
  // A plastic disc dropping into a plastic rack.
  contact: (sound) => sound.plastic(),
  colors: DISC_COLORS,
  // The keyboard walks along the tops of the columns.
  keyPoints: () => Array.from({ length: COLS }, (_, col) => ({ x: cellAt(col).x, z: 0 })),
  keyStart: () => 3,
  name: "사목",
  english: "Four in a Row",
  number: "NO. 21 — DROP FOUR",
  intro: `<p>흔히 '커넥트 포'로 알려진 놀이 방식입니다. 세워 둔 틀에 원반을 떨어뜨립니다.<br>가로·세로·대각선으로 넷을 먼저 이으면 이깁니다.</p><ul class="rule-list"><li>원반은 고른 줄의 맨 아래 빈칸까지 떨어집니다</li><li>넷이 한 줄로 이어지면 승리</li><li>칸이 모두 차면 무승부</li></ul>`,
  meta: `2인 · ${COLS}줄 × ${ROWS}칸`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FOUR IN A LINE</span>`,
  artClass: "fourrow-art",
  artLabel: "사목 틀 미리보기",
  tableLabel: "THE CARE-HOME TABLE",
  tableNote: () => `${COLS}줄 × ${ROWS}칸 · 빨강 선공`,
  rulesTitle: "넷을 한 줄로 이으세요",
  rules:
    part("기본 규칙", steps(`세워 둔 틀에는 ${COLS}개의 줄이 있고, 줄마다 원반이 ${ROWS}개까지 들어갑니다.`, "<b>빨강이 먼저</b> 두고 번갈아 원반을 하나씩 떨어뜨립니다.", "원반은 고른 줄의 <b>맨 아래 빈칸</b>까지 떨어집니다. 가득 찬 줄에는 넣을 수 없습니다.", "내 원반 <b>넷을 가로·세로·대각선 한 줄</b>로 먼저 이으면 이깁니다.", "칸 42개가 모두 찰 때까지 승부가 나지 않으면 무승부입니다.")) +
    part("알아 둘 모양", table(["셋", "양 끝이 비어 있고 둘 수 있는 높이면 다음 수에 이깁니다. 상대의 셋은 바로 막습니다."], ["받침", "어떤 칸은 그 아래 칸이 차야 둘 수 있습니다. 상대가 이길 칸의 <b>바로 아래</b>에 두면 받침을 놓아 주는 셈입니다."], ["양수겸장", "이길 칸을 한 번에 두 곳 만들면 한 곳만 막을 수 있어 이깁니다."])) +
    part("처음이라면", notes("가운데 줄이 가장 많은 줄에 닿습니다. 초반에는 가운데부터 채웁니다.", "두기 전에 그 원반 위 칸을 상대가 쓰면 어떻게 되는지 봅니다.", "대각선은 놓치기 쉽습니다. 상대 원반이 계단 모양으로 놓였는지 살핍니다.")) +
    part("그 밖에", notes("새 게임 설정에서 대전 방식과 컴퓨터 난이도(쉬움·보통·어려움)를 고릅니다.", "<b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  help: "마우스·터치: 원반을 넣을 줄을 누릅니다<br>키보드: 판을 선택하고 좌우 방향키로 줄 이동, Enter로 떨어뜨리기",
  sides: ["빨강", "노랑"],
  startWord: "테이블에 앉기",
};
