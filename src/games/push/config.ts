import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, LAYOUTS, QUIET, REPEATS, TO_WIN, marblePush, refusal, type State } from "./rules";
import { chooseMove, evaluate } from "./ai";
import { cellAt } from "./layout";
import { PUSH_COLORS } from "./marbles";
import { PushView } from "./view";

const labelOf = (variant: string) => LAYOUTS.find((l) => l.value === variant)?.label ?? LAYOUTS[0].label;
export const marblePushConfig: PointConfig<State> = {
  game: { ...marblePush, evaluate, choose: (state, level, random) => chooseMove(state, level, random) },
  // The marbles pushed off lie in the two bowls on the table; the panel stays in the page for readers.
  noPanel: true,
  view: (host, quality, _variant, mode) => new PushView(host, quality, mode),
  colors: PUSH_COLORS,
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  keyPoints: () => CELLS.map((_, i) => cellAt(i)),
  keyStart: (state) => {
    // The marble of the side to move nearest the middle.
    let best = 0,
      near = Infinity;
    state.cells.forEach((owner, c) => {
      const p = cellAt(c),
        d = Math.hypot(p.x, p.z);
      if (owner === state.turn && d < near) {
        near = d;
        best = c;
      }
    });
    return best;
  },
  variants: LAYOUTS,
  variantLabel: "처음 배치",
  refusal,
  // Glass settling into stone; marbles knocking together in a push; a heavier knock when one drops into the gutter,
  // and the click of stone on stone as it comes to rest in a bowl.
  contact: (sound) => sound.glass(4),
  knock: (sound, kind) => (kind === "disc" ? sound.marble() : kind === "cushion" ? sound.knock(4) : sound.stone(4)),
  // A marble pushed off is called out once it lies in its bowl.
  cheer: (before, state, mode) => {
    const last = state.last;
    if (!last || last.off < 0 || state.ply !== before.ply + 1 || state.winner !== null) return null;
    return mode === "ai" && last.side === 1 ? "밀려났다!" : "밀어냈다!";
  },
  cheerOnRest: true,
  movingText: "구슬이 구르는 중…",
  name: "구슬 밀기",
  english: "Marble Push",
  number: "NO. 102 — PUSH THEM OFF",
  intro: `<p>돌로 깎은 육각 판 위에서 구슬을 한 줄로 밀어붙입니다. 보드게임 ‘아발론’과 같은 방식입니다.<br>상대 구슬 ${TO_WIN}개를 먼저 판 밖으로 밀어내면 이깁니다.</p>`,
  meta: `2인 · 칸 61개 · 구슬 14개씩 · ${TO_WIN}개를 먼저 밀어내면 승리`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>THREE PUSH TWO</span>`,
  artClass: "starhop-art",
  artLabel: "구슬 밀기 판 미리보기",
  tableLabel: "THE GARDEN ROOM",
  tableNote: (variant) => `${labelOf(variant)} · 호박 선공`,
  rulesTitle: "한 줄로 밀어 판 밖으로",
  rules:
    part(
      "기본 규칙",
      steps(
        "한 변에 다섯 칸, 모두 61칸인 육각형 판에서 두 사람이 구슬 14개씩을 놓고 시작합니다. <b>호박(가까운 쪽)이 먼저</b> 두고 번갈아 둡니다.",
        "차례마다 <b>내 구슬 1~3개</b>를 골라 여섯 방향 가운데 한쪽으로 <b>한 칸</b> 옮깁니다. 둘이나 셋은 한 줄로 붙어 있어야 합니다.",
        "구슬이 늘어선 줄 방향으로 옮기면(<b>줄 이동</b>) 바로 앞의 상대 구슬을 밀 수 있습니다. 줄과 다른 방향으로 옮기면(<b>옆 이동</b>) 들어갈 칸이 모두 비어 있어야 합니다.",
        `밀려서 판 밖으로 떨어진 구슬은 홈을 따라 굴러 민 쪽의 그릇에 들어갑니다. 상대 구슬 <b>${TO_WIN}개</b>를 먼저 밀어내면 이깁니다.`,
        "내 구슬은 판 밖으로 옮길 수 없습니다.",
      ),
    ) +
    part(
      "밀기",
      table(
        ["3 대 2 · 3 대 1 · 2 대 1", "줄 방향으로 움직이는 내 구슬이 바로 앞에 줄지어 선 상대 구슬보다 <b>많을 때만</b> 밉니다. 함께 움직이는 구슬은 셋까지입니다."],
        ["밀 수 없을 때", "구슬 하나로는 밀지 못합니다. 2 대 2, 3 대 3처럼 수가 같거나 상대가 많아도 못 밀고, 밀리는 상대 구슬 바로 뒤에 내 구슬이 있어도 못 밉니다."],
        ["빈칸 너머", "밀리는 것은 바로 앞에 이어 선 상대 구슬까지입니다. 그 뒤가 빈칸이면 한 칸씩 밀려납니다."],
        ["밀어내기", "밀리는 줄의 맨 끝 구슬이 가장자리에 있으면 판 밖으로 떨어집니다."],
        ["옆 이동", "옆으로는 아무것도 밀 수 없습니다."],
      ),
    ) +
    part(
      "무승부",
      table(
        ["같은 배치", `구슬 놓인 모양과 둘 차례가 같은 배치가 ${REPEATS}번째 나오면 비깁니다.`],
        ["밀어내지 못함", `${QUIET / 2}수씩(모두 ${QUIET}수) 지나도록 아무도 구슬을 밀어내지 못하면 비깁니다.`],
      ),
    ) +
    part(
      "처음 배치",
      table(
        ["기본 배치", "앞의 두 줄과 셋째 줄 가운데 세 칸에 놓습니다."],
        ["꽃 두 송이", "일곱 개씩 꽃 모양으로 뭉친 두 무더기를 양쪽 모서리 가까이 엇갈려 놓습니다. 처음부터 상대와 가까이 붙습니다."],
        ["안쪽 꽃", "꽃 두 송이를 한 줄씩 안쪽으로 당겨 놓습니다. 가장자리에 구슬이 없어 더 길게 겨룹니다."],
      ),
    ) +
    part(
      "화면",
      table(
        ["고르기", "내 구슬을 누르면 들려 오르고 금색 고리가 생깁니다. 한 줄로 이어진 내 구슬을 더 누르거나 손가락으로 쓸어 셋까지 묶습니다. 묶을 수 있는 구슬에는 흰 고리가 뜹니다. 고른 구슬을 다시 누르면 내려놓습니다."],
        ["화살표", "묶음 둘레 여섯 화살표 가운데 하나나 갈 칸을 누르면 옮깁니다. 금색은 옮기기, 주황은 밀기, 빨강은 밀어내기, 회색은 갈 수 없는 쪽입니다."],
        ["그릇", "오른쪽 그릇에는 호박이 밀어낸 청금석 구슬이, 왼쪽 그릇에는 청금석이 밀어낸 호박 구슬이 놓입니다."],
        ["키보드", "방향키로 칸을 고르고 Enter로 누릅니다. W·E·A·D·Z·X로 묶음을 왼쪽 위·오른쪽 위·왼쪽·오른쪽·왼쪽 아래·오른쪽 아래로 옮깁니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "가운데를 먼저 차지하세요. 가장자리의 구슬은 밀려나기 쉽습니다.",
        "구슬을 셋씩 뭉쳐 두면 잘 밀리지 않고, 상대를 밀 힘이 생깁니다.",
        "가장자리에 선 내 구슬 뒤로 상대 구슬이 더 길게 줄지어 서면 다음 차례에 밀려납니다. 미리 비키거나 내 구슬을 덧대세요.",
      ),
    ),
  sides: ["호박", "청금석"],
  startWord: "테이블에 앉기",
};
