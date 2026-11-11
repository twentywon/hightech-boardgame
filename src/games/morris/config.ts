import type { PointConfig } from "../../ui/point-game";
import { morrisBoard } from "./board";
import { MEN, QUIET_LIMIT, morris, type State } from "./rules";

export const morrisConfig: PointConfig<State> = {
  game: morris,
  board: morrisBoard,
  name: "나인 멘스 모리스",
  english: "Nine Men's Morris",
  number: "NO. 11 — MILLS",
  intro: `<p>말 아홉 개로 셋을 한 줄에 세우는 오래된 놀이.<br>줄을 만들 때마다 상대 말을 하나 떼어 냅니다.</p><ul class="rule-list"><li>먼저 번갈아 말 아홉 개를 놓습니다</li><li>그다음 선을 따라 한 칸씩 옮깁니다</li><li>셋이 남으면 어디로든 날아갑니다</li></ul>`,
  meta: `2인 · 점 24개 · 말 ${MEN}개씩`,
  art: `<div class="pg-mini morris"><i></i><i></i><i></i></div><span>THREE IN A ROW</span>`,
  artClass: "morris-art",
  artLabel: "나인 멘스 모리스 판 미리보기",
  tableLabel: "THE MORRIS BOARD",
  tableNote: () => `점 24개 · 말 ${MEN}개씩`,
  rulesTitle: "셋을 한 줄에 세워 상대 말을 떼어 내세요",
  rules: `<ol><li>검정이 먼저 둡니다. 선 위에 내 말 <b>셋이 나란히</b> 서면 '밀'이 되고, 밀을 만들 때마다 상대 말 하나를 골라 떼어 냅니다.</li><li>밀에 들어 있는 말은 뗄 수 없습니다. 상대 말이 모두 밀에 들어 있을 때만 아무 말이나 뗄 수 있습니다.</li><li>상대 말을 <b>둘만 남기거나</b>, 상대가 <b>움직일 수 없게</b> 만들면 이깁니다.</li></ol><h3>세 단계</h3><dl class="piece-moves"><dt>놓기</dt><dd>번갈아 빈 점에 말을 하나씩, 각자 ${MEN}개를 모두 놓습니다.</dd><dt>옮기기</dt><dd>말을 모두 놓은 뒤에는 내 말 하나를 선을 따라 이웃한 빈 점으로 옮깁니다.</dd><dt>날기</dt><dd>내 말이 셋만 남으면 선과 상관없이 아무 빈 점으로나 옮길 수 있습니다.</dd></dl><p>같은 밀이라도 말을 뺐다가 다시 넣으면 새로 만든 것으로 칩니다. 옮기기 단계에서 ${QUIET_LIMIT}수 동안 아무도 말을 떼지 못하면 비깁니다. <b>무르기</b>는 직전 수를 되돌립니다. 저장은 없습니다.</p>`,
  sides: ["검정", "하양"],
  startWord: "테이블에 앉기",
};
