import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { hexaBoard } from "./board";
import { MAPS, hexa, mapOf, type State } from "./rules";

export const hexaConfig: PointConfig<State> = {
  game: hexa,
  panel: "big",
  board: hexaBoard,
  name: "헥사 세균전",
  english: "Hexa Germ War",
  number: "NO. 10 — SPREAD",
  intro: `<p>육각 판 위에서 세균을 불려 나갑니다.<br>옆으로 복제하고, 멀리 뛰어 상대를 물들이세요.</p>`,
  meta: `2인 · 맵 ${Object.keys(MAPS).length}가지 · 세균 3개로 시작`,
  art: `<div class="pg-mini hexa">${"<i></i>".repeat(7)}</div><span>COPY, JUMP, CONVERT</span>`,
  artClass: "hexa-art",
  artLabel: "헥사 세균전 판 미리보기",
  tableLabel: "THE CULTURE DISH",
  tableNote: (variant) => `맵 · ${MAPS[mapOf(variant)].name}`,
  rulesTitle: "더 많이 퍼뜨린 쪽이 이깁니다",
  rules:
    part("기본 규칙", steps("육각 판의 모서리에 각자 세균 세 개를 두고 시작합니다. <b>파랑이 먼저</b> 둡니다.", "차례마다 내 세균 하나를 골라 빈칸으로 움직입니다.", "도착한 칸에 <b>붙어 있는 상대 세균은 모두 내 세균</b>으로 바뀝니다.", "움직일 수 없는 쪽이 생기면 끝납니다. 남은 빈칸은 움직일 수 있는 쪽이 모두 차지합니다.", "세균이 더 많은 쪽이 이깁니다.")) +
    part("움직이는 방법", table(["복제", "바로 옆 칸(1칸)으로 갑니다. 원래 세균은 그대로 있고 새 세균이 하나 생깁니다."], ["점프", "두 칸 떨어진 칸으로 갑니다. 원래 자리는 비고 세균이 옮겨 갑니다. 사이에 있는 칸은 뛰어넘습니다."], ["막힌 자리", "맵마다 다릅니다. 누구도 들어갈 수 없지만 뛰어넘을 수는 있습니다."])) +
    part("처음이라면", notes("복제는 세균이 늘고 점프는 늘지 않습니다. 되도록 복제로 넓힙니다.", "점프하면 떠난 자리에 구멍이 생겨 상대가 파고들기 쉽습니다.", "상대 세균이 많이 붙어 있는 빈칸이 가장 좋은 자리입니다.")) +
    part("그 밖에", notes("새 게임 설정에서 맵과 컴퓨터 난이도(쉬움·보통·어려움)를 고릅니다.", "<b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  sides: ["파랑", "빨강"],
  variantLabel: "맵",
  variants: Object.entries(MAPS).map(([value, map]) => ({ value, label: map.name })),
  startWord: "테이블에 앉기",
};
