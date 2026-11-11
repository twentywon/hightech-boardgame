import type { PointConfig } from "../../ui/point-game";
import { hexaBoard } from "./board";
import { CELLS, hexa, type State } from "./rules";

export const hexaConfig: PointConfig<State> = {
  game: hexa,
  board: hexaBoard,
  name: "헥사 세균전",
  english: "Hexa Germ War",
  number: "NO. 10 — SPREAD",
  intro: `<p>육각 판 위에서 세균을 불려 나갑니다.<br>옆으로 복제하고, 멀리 뛰어 상대를 물들이세요.</p><ul class="rule-list"><li>옆 칸으로 가면 복제, 두 칸을 뛰면 이동</li><li>도착한 칸에 닿은 상대 세균은 모두 내 편</li><li>판이 끝났을 때 세균이 많은 쪽이 승리</li></ul>`,
  meta: `2인 · 육각 ${CELLS.length}칸 · 세균 3개로 시작`,
  art: `<div class="pg-mini hexa">${"<i></i>".repeat(7)}</div><span>COPY, JUMP, CONVERT</span>`,
  artClass: "hexa-art",
  artLabel: "헥사 세균전 판 미리보기",
  tableLabel: "THE CULTURE DISH",
  tableNote: () => `육각 ${CELLS.length}칸`,
  rulesTitle: "더 많이 퍼뜨린 쪽이 이깁니다",
  rules: `<ol><li>파랑이 먼저 두고 번갈아 한 번씩 움직입니다. 각자 모서리의 세균 세 개로 시작합니다.</li><li>내 세균 하나를 고른 뒤 빈칸을 고릅니다.</li><li>세균이 도착한 칸에 <b>붙어 있는 상대 세균은 모두 내 세균</b>으로 바뀝니다.</li><li>움직일 수 없는 쪽이 생기면 대국이 끝납니다. 이때 남은 빈칸은 움직일 수 있는 쪽이 모두 차지하고, 세균이 많은 쪽이 이깁니다.</li></ol><h3>움직이는 방법</h3><dl class="piece-moves"><dt>복제</dt><dd>바로 옆 칸(1칸)으로 가면 원래 세균은 그대로 있고 새 세균이 하나 생깁니다.</dd><dt>점프</dt><dd>두 칸 떨어진 칸으로 가면 원래 자리는 비고 세균이 옮겨 갑니다. 사이에 있는 칸은 뛰어넘습니다.</dd></dl><p>가운데의 빈 세 자리는 누구도 들어갈 수 없습니다. <b>무르기</b>는 직전 수를 되돌리며, 컴퓨터 대전에서는 내 차례로 돌아갑니다. 저장은 없습니다.</p>`,
  sides: ["파랑", "빨강"],
  startWord: "테이블에 앉기",
  budget: 400,
};
