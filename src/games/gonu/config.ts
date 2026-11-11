import type { PointConfig } from "../../ui/point-game";
import { gonuBoard } from "./board";
import { NAMES, QUIET_LIMIT, VARIANTS, gonu, type State, type Variant } from "./rules";

export const gonuConfig: PointConfig<State> = {
  game: gonu,
  board: gonuBoard,
  name: "고누",
  english: "Gonu",
  number: "NO. 12 — ON THE GROUND",
  intro: `<p>마당 흙바닥에 말판을 긋고 돌멩이로 두는 놀이.<br>우물고누, 네줄고누, 호박고누를 고를 수 있습니다.</p><ul class="rule-list"><li>말은 선을 따라 한 칸씩 움직입니다</li><li>우물·호박고누: 상대를 가두면 승리</li><li>네줄고누: 상대 말을 사이에 끼워 잡습니다</li></ul>`,
  meta: "2인 · 말판 세 가지 · 돌멩이 2–4개씩",
  art: `<div class="pg-mini gonu"><i></i><i></i><i></i><i></i></div><span>LINES IN THE EARTH</span>`,
  artClass: "gonu-art",
  artLabel: "고누 말판 미리보기",
  tableLabel: "THE YARD",
  tableNote: (variant) => NAMES[(variant in NAMES ? variant : "well") as Variant],
  rulesTitle: "선을 따라 한 칸씩, 판마다 다른 승부",
  rules: `<p>검은 돌이 먼저 두고 번갈아 한 번씩 움직입니다. 어느 판에서나 말은 <b>선을 따라 이웃한 빈 점으로 한 칸</b> 갑니다.</p><h3>말판</h3><dl class="piece-moves"><dt>우물고누</dt><dd>점 다섯 개에 말 두 개씩. 한쪽 변은 우물이라 선이 없습니다. 상대가 <b>움직일 수 없게 가두면</b> 이깁니다. 다만 첫 수로 바로 가두는 수는 둘 수 없습니다.</dd><dt>네줄고누</dt><dd>가로세로 네 줄의 판에 말 네 개씩. 내 말을 옮겨 상대 말 하나를 <b>내 말 둘 사이에 한 줄로 끼우면</b> 그 말을 잡습니다. 상대가 스스로 사이에 들어온 것은 잡지 못합니다. 상대 말이 하나만 남거나 움직일 수 없으면 이깁니다.</dd><dt>호박고누</dt><dd>각자 집(가로줄)에 말 세 개. 집에서 나와 둥근 밭으로 들어갑니다. <b>한번 나온 말은 집으로 돌아갈 수 없고</b>, 상대 집에도 들어갈 수 없습니다. 상대가 움직일 수 없게 가두면 이깁니다.</dd></dl><p>고누는 지방마다 말판과 규칙이 조금씩 다릅니다. 여기서는 널리 알려진 방식을 따랐습니다. ${QUIET_LIMIT}수 동안 승부가 나지 않으면 비깁니다. <b>무르기</b>는 직전 수를 되돌립니다. 저장은 없습니다.</p>`,
  sides: ["검은 돌", "흰 돌"],
  variants: VARIANTS.map((value) => ({ value, label: NAMES[value] })),
  startWord: "마당에 앉기",
  budget: 300,
};
