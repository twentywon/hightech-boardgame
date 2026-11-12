import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DRAW, LEFT, PASS, RIGHT, domino, type State } from "./rules";
import { DOMINO_COLORS, DominoView } from "./view";

export const dominoConfig: PointConfig<State> = {
  game: domino,
  view: (host, quality) => new DominoView(host, quality),
  colors: DOMINO_COLORS,
  // The keyboard walks my hand and the two ends of the line.
  keyPoints: (state) =>
    Array.from({ length: 30 }, (_, point) => {
      const i = state.hands[0].indexOf(point);
      return point === LEFT ? { x: -3, z: 0 } : point === RIGHT ? { x: 3, z: 0 } : i >= 0 ? { x: (i - (state.hands[0].length - 1) / 2) * 0.68, z: 3.7 } : { x: 999, z: 999 };
    }),
  keyStart: (state) => state.hands[0][0] ?? 0,
  // The other hand and the pile are hidden: against the computer only, and nothing is taken back.
  computerOnly: true,
  noUndo: true,
  autoSingle: true,
  showMovable: false,
  tools: [
    { label: "더미에서 가져오기", point: DRAW },
    { label: "차례 넘기기", point: PASS },
  ],
  firstNote: "내가 먼저 냅니다.",
  name: "도미노",
  english: "Dominoes",
  number: "NO. 28 — MATCH THE ENDS",
  intro: `<p>어두운 마룻바닥 위에 패를 한 줄로 이어 갑니다.<br>줄 끝의 숫자와 같은 숫자를 가진 패만 놓을 수 있습니다.</p>`,
  meta: "나 대 컴퓨터 · 패 28장 · 일곱 장씩",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>END TO END</span>`,
  artClass: "domino-art",
  artLabel: "도미노 줄 미리보기",
  tableLabel: "THE DARK FLOOR",
  tableNote: () => "패 28장 · 일곱 장씩",
  rulesTitle: "끝과 끝을 맞춰 이으세요",
  rules:
    part("기본 규칙", steps("패는 두 칸으로 나뉘어 칸마다 0–6개의 눈이 있습니다. 모두 28장입니다.", "일곱 장씩 나누어 갖고, 남은 14장은 엎어서 <b>더미</b>로 둡니다.", "<b>내가 먼저</b> 아무 패나 하나 놓습니다.", "그다음부터는 줄의 <b>양 끝 중 한쪽</b>에, 그 끝의 숫자와 <b>같은 숫자</b>가 있는 패를 맞대어 놓습니다.", "패를 먼저 모두 내면 이깁니다.")) +
    part("낼 패가 없을 때", table(["가져오기", "더미에서 한 장 가져옵니다. 낼 수 있는 패가 나올 때까지 계속 가져옵니다."], ["넘기기", "더미도 비었으면 차례를 넘깁니다."], ["막힘", "두 사람이 잇달아 넘기면 끝납니다. 남은 패의 <b>눈 합계가 적은</b> 쪽이 이기고, 같으면 무승부입니다."])) +
    part("패 놓기", table(["한쪽에만 맞는 패", "누르면 바로 놓입니다."], ["양쪽에 다 맞는 패", "패를 누른 뒤, 줄 끝에 뜨는 금색 고리 중 하나를 누릅니다."], ["같은 눈 두 개(더블)", "줄에 가로질러 놓입니다. 규칙은 다른 패와 같습니다."])) +
    part("처음이라면", notes("눈이 많은 패부터 내면 막혔을 때 남는 눈이 줄어듭니다.", "내가 많이 가진 숫자로 양 끝을 만들면 상대가 가져와야 합니다.", "더블은 한 숫자에만 맞아 내기 어렵습니다. 기회가 오면 먼저 냅니다.", "상대가 가져간 숫자는 상대가 갖고 있지 않던 숫자입니다.")),
  help: "마우스·터치: 내 패를 누릅니다. 양쪽에 맞으면 줄 끝의 고리를 누릅니다<br>키보드: 판을 선택하고 방향키·Enter",
  sides: ["나", "컴퓨터"],
  startWord: "바닥에 앉기",
};
