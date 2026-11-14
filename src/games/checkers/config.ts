import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { checkersBoard } from "./board";
import { QUIET_LIMIT, checkers, type State } from "./rules";

export const checkersConfig: PointConfig<State> = {
  game: checkers,
  noPanel: true,
  board: checkersBoard,
  name: "체커",
  english: "Checkers",
  number: "NO. 13 — JUMP",
  intro: `<p>대각선으로 한 칸씩, 상대 말은 뛰어넘어 잡습니다.<br>끝줄에 닿으면 왕이 되어 뒤로도 갑니다.</p>`,
  meta: "2인 · 8×8 · 말 12개씩",
  art: `<div class="pg-mini checkers">${"<i></i>".repeat(4)}</div><span>JUMP TO CAPTURE</span>`,
  artClass: "checkers-art",
  artLabel: "체커판 미리보기",
  tableLabel: "THE CHECKERBOARD",
  tableNote: () => "8 × 8 · 말 12개씩",
  rulesTitle: "뛰어넘어 모두 잡으세요",
  rules:
    part("기본 규칙", steps("8×8 판의 어두운 칸에 말 12개씩을 놓고 시작합니다. <b>빨강이 먼저</b> 둡니다.", "말은 <b>대각선 앞으로 한 칸</b> 움직입니다.", "바로 앞 대각선에 상대 말이 있고 그 너머가 비어 있으면 <b>뛰어넘어 잡습니다</b>.", "상대 말을 모두 잡거나 상대가 움직일 수 없게 만들면 이깁니다.")) +
    part("잡기", table(["강제", "잡을 수 있는 수가 있으면 반드시 잡아야 합니다."], ["연속 잡기", "뛰어넘은 자리에서 또 잡을 수 있으면 같은 말로 계속 뜁니다."], ["무승부", `${QUIET_LIMIT}수 동안 아무도 말을 잡지 못하면 비깁니다.`])) +
    part("말", table(["말", "대각선 앞으로만 한 칸. 잡을 때도 앞으로만 뜁니다."], ["왕", "맞은편 끝줄에 닿은 말은 왕이 됩니다(두 겹으로 표시). 앞뒤 대각선 어느 쪽으로든 한 칸 움직이고 잡습니다. 왕이 되는 순간 그 차례는 끝납니다."])) +
    part("처음이라면", notes("맨 뒷줄의 말을 남겨 두면 상대가 왕을 만들기 어렵습니다.", "판 가장자리의 말은 잡히지 않지만 갈 곳이 적습니다.", "말 하나를 내주고 둘을 잡는 맞바꿈을 노립니다.")) +
    part("그 밖에", notes("새 게임 설정에서 대전 방식과 컴퓨터 난이도를 고릅니다.", "<b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  sides: ["빨강", "하양"],
  startWord: "테이블에 앉기",
};
