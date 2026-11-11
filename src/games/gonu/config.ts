import type { PointConfig } from "../../ui/point-game";
import { gonuBoard } from "./board";
import { NAMES, QUIET_LIMIT, VARIANTS, gonu, type State, type Variant } from "./rules";

export const gonuConfig: PointConfig<State> = {
  game: gonu,
  board: gonuBoard,
  name: "고누",
  english: "Gonu",
  number: "NO. 12 — ON THE GROUND",
  intro: `<p>마당 흙바닥에 말판을 긋고 돌멩이로 두는 놀이.<br>우물·네줄·호박·자동차·참고누 다섯 가지 말판이 있습니다.</p><ul class="rule-list"><li>말은 선을 따라 한 칸씩 움직입니다</li><li>우물·호박고누: 상대를 가두면 승리</li><li>네줄·자동차·참고누: 상대 말을 잡습니다</li></ul>`,
  meta: "2인 · 말판 다섯 가지 · 돌멩이 2–12개씩",
  art: `<div class="pg-mini gonu"><i></i><i></i><i></i><i></i></div><span>LINES IN THE EARTH</span>`,
  artClass: "gonu-art",
  artLabel: "고누 말판 미리보기",
  tableLabel: "THE YARD",
  tableNote: (variant) => NAMES[(variant in NAMES ? variant : "well") as Variant],
  rulesTitle: "선을 따라 한 칸씩, 판마다 다른 승부",
  rules: `<p>검은 돌이 먼저 두고 번갈아 한 번씩 움직입니다. 말은 <b>선을 따라 이웃한 빈 점으로 한 칸</b> 가는 것이 기본이고, 말판마다 규칙이 더해집니다.</p><h3>말판</h3><dl class="piece-moves"><dt>우물고누</dt><dd>점 다섯 개에 말 두 개씩. 한쪽 변은 우물이라 선이 없습니다. 상대가 <b>움직일 수 없게 가두면</b> 이깁니다. 다만 첫 수로 바로 가두는 수는 둘 수 없습니다.</dd><dt>네줄고누</dt><dd>가로세로 네 줄의 판에 말 네 개씩. 내 말을 옮겨 상대 말 하나를 <b>내 말 둘 사이에 한 줄로 끼우면</b> 그 말을 잡습니다. 상대가 스스로 사이에 들어온 것은 잡지 못합니다. 상대 말이 하나만 남거나 움직일 수 없으면 이깁니다.</dd><dt>호박고누</dt><dd>각자 집(가로줄)에 말 세 개. 집에서 나와 둥근 밭으로 들어갑니다. <b>한번 나온 말은 집으로 돌아갈 수 없고</b>, 상대 집에도 들어갈 수 없습니다. 상대가 움직일 수 없게 가두면 이깁니다.</dd><dt>자동차고누</dt><dd>네 줄 판의 네 귀퉁이에 둥근 길이 있습니다. 말은 한 칸씩 움직이고, 상대 말을 잡을 때만 <b>둥근 길을 한 번 이상 돌아서</b> 달려갑니다. 달리는 길은 비어 있어야 하고, 처음 만나는 상대 말을 잡아 그 자리에 섭니다. 둥근 길은 가운데 두 줄(가로·세로)의 끝을 잇습니다. 상대 말을 모두 잡으면 이깁니다.</dd><dt>참고누</dt><dd>네모 셋을 변의 가운데와 귀퉁이로 이은 판에 말 12개씩. 번갈아 말을 놓고, 다 놓으면 한 칸씩 옮깁니다. 내 말 <b>셋이 한 줄</b>이 되면 상대 말 하나를 뗍니다(줄 안의 말은 다른 말이 있는 한 뗄 수 없음). 말이 셋 남으면 아무 빈 점으로나 옮길 수 있고, 상대 말이 둘이 되거나 움직일 수 없으면 이깁니다. 판이 가득 차면 비깁니다.</dd></dl><p>고누는 지방마다 말판과 규칙이 조금씩 다릅니다. 여기서는 널리 알려진 방식을 따랐습니다. ${QUIET_LIMIT}수 동안 승부가 나지 않으면 비깁니다. <b>무르기</b>는 직전 수를 되돌립니다. 저장은 없습니다.</p>`,
  sides: ["검은 돌", "흰 돌"],
  variants: VARIANTS.map((value) => ({ value, label: NAMES[value] })),
  startWord: "마당에 앉기",
  showMovable: false,
};
