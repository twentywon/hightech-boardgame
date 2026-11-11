import type { PointConfig } from "../../ui/point-game";
import { checkersBoard } from "./board";
import { QUIET_LIMIT, checkers, type State } from "./rules";

export const checkersConfig: PointConfig<State> = {
  game: checkers,
  board: checkersBoard,
  name: "체커",
  english: "Checkers",
  number: "NO. 13 — JUMP",
  intro: `<p>대각선으로 한 칸씩, 상대 말은 뛰어넘어 잡습니다.<br>끝줄에 닿으면 왕이 되어 뒤로도 갑니다.</p><ul class="rule-list"><li>어두운 칸에서만 대각선으로 움직입니다</li><li>잡을 수 있으면 반드시 잡아야 합니다</li><li>한 말로 이어서 여러 번 뛸 수 있습니다</li></ul>`,
  meta: "2인 · 8×8 · 말 12개씩",
  art: `<div class="pg-mini checkers">${"<i></i>".repeat(4)}</div><span>JUMP TO CAPTURE</span>`,
  artClass: "checkers-art",
  artLabel: "체커판 미리보기",
  tableLabel: "THE CHECKERBOARD",
  tableNote: () => "8 × 8 · 말 12개씩",
  rulesTitle: "뛰어넘어 모두 잡으세요",
  rules: `<ol><li>빨강이 먼저 둡니다. 말은 <b>어두운 칸 위에서 대각선 앞으로 한 칸</b> 움직입니다.</li><li>바로 앞 대각선에 상대 말이 있고 그 너머가 비어 있으면 <b>뛰어넘어 잡습니다</b>. 잡을 수 있는 수가 있으면 반드시 잡아야 합니다.</li><li>뛰어넘은 자리에서 또 잡을 수 있으면 <b>같은 말로 계속</b> 뜁니다.</li><li>상대 말을 모두 잡거나 상대가 움직일 수 없게 만들면 이깁니다.</li></ol><h3>말</h3><dl class="piece-moves"><dt>말</dt><dd>대각선 앞으로만 한 칸. 잡을 때도 앞으로만 뜁니다.</dd><dt>왕</dt><dd>맞은편 끝줄에 닿은 말은 왕이 되어(두 겹으로 표시) 앞뒤 대각선 어느 쪽으로든 한 칸 움직이고 잡습니다. 왕이 되는 순간 그 차례는 끝납니다.</dd></dl><p>${QUIET_LIMIT}수 동안 아무도 말을 잡지 못하면 비깁니다. <b>무르기</b>는 직전 수를 되돌립니다. 저장은 없습니다.</p>`,
  sides: ["빨강", "하양"],
  startWord: "테이블에 앉기",
};
