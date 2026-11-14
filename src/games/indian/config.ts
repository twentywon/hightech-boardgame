import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { READY, ANTE, DECIDE, DOWN, FOLD, NEXT, START_CHIPS, TEN_PENALTY, UP, indian, wagerText, type State } from "./rules";
import { CHIP_COLORS, IndianView } from "./view";

export const indianConfig: PointConfig<State> = {
  game: indian,
  panel: "big",
  // Only the chips each has left.
  tallyHtml: (state) => [0, 1].map((p) => `<span class="sr-text">칩 </span>${state.chips[p]}`) as [string, string],
  view: (host, quality) => new IndianView(host, quality),
  colors: CHIP_COLORS,
  // Each sees only the other's card: one screen cannot serve two.
  computerOnly: true,
  noUndo: true,
  bankrupt: (state) => state.chips[0] === 0,
  // The computer sometimes takes its time, as someone weighing a bet does.
  ponder: (state) => (state.phase === "bet" && Math.random() < 0.5 ? 600 + Math.random() * 1900 : 0),
  tools: [
    { label: "이마에 얹기", point: READY },
    // The bet is set with the two and made with 결정; they stay in place, greyed at either end.
    { label: "− 베팅 내리기", point: DOWN, show: (state) => state.phase === "bet" },
    { label: "+ 베팅 올리기", point: UP, show: (state) => state.phase === "bet" },
    // 결정 never moves: 다이 keeps its place beside it, unseen until giving up is possible.
    { label: "결정", point: DECIDE, show: (state) => state.phase === "bet", text: (state) => `결정 · ${wagerText(state).replace("내 ", "")}` },
    { label: "다이", point: FOLD, keep: (state) => state.phase === "bet" },
    { label: "다음 판", point: NEXT },
  ],
  firstNote: "첫 판은 내가 먼저 걸고, 판마다 번갈아 먼저 겁니다.",
  name: "인디언 포커",
  english: "Indian Poker",
  number: "NO. 33 — THE CARD YOU CANNOT SEE",
  intro: `<p>맞은편의 흰 마네킹이 카드를 이마에 붙이고 나를 봅니다.<br>상대 카드는 보이지만 내 카드는 보이지 않습니다. 그 한 장에 칩을 겁니다.</p>`,
  meta: `나 대 컴퓨터 · 카드 20장 · 칩 ${START_CHIPS}개씩`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>READ THE OTHER FACE</span>`,
  artClass: "indian-art",
  artLabel: "인디언 포커 미리보기",
  tableLabel: "ACROSS THE TABLE",
  tableNote: () => `한 덱 20장 · 10판`,
  rulesTitle: "내 카드만 모르는 내기",
  rules:
    part("기본 규칙", steps("카드는 1부터 10까지 두 장씩, 모두 20장입니다. 한 번 쓴 카드는 다시 나오지 않습니다.", `판마다 둘 다 기본 판돈 ${ANTE}개를 내고 카드를 한 장씩 받아 <b>보지 않고 이마에 붙입니다</b>.`, "<b>상대 카드는 보이고 내 카드는 보이지 않습니다.</b> 상대도 마찬가지입니다.", "번갈아 칩을 겁니다. 건 칩이 맞춰지면 카드를 확인하고 <b>높은 쪽</b>이 판돈을 가져갑니다.", "<b>한 게임은 카드 한 덱</b>입니다. 20장을 다 쓸 때까지 10판을 하고, 끝났을 때 칩이 많은 쪽이 이깁니다.", "그 전에 한쪽이 <b>걸 칩이 하나도 없게 되면 파산</b>이고, 게임은 그 자리에서 끝납니다.")) +
    part("내 차례에 할 수 있는 것", table(["+ 베팅 올리기 · − 베팅 내리기", "내가 걸 칩을 한 개씩 올리고 내립니다. 누르는 동안에는 아무것도 걸리지 않습니다. 상대가 받을 수 있는 만큼까지만 올릴 수 있습니다."], ["결정", "정한 만큼 겁니다. 버튼에 지금 누르면 어떻게 되는지가 적혀 있습니다. 올리지 않고 누르면 상대가 건 만큼만 맞추고(콜) 카드를 확인합니다. 아무도 걸지 않았을 때 먼저 하는 쪽이 올리지 않고 누르면 차례만 넘깁니다(체크)."], ["팻말", "탁자 위 왼쪽 팻말에는 지금까지 걸린 <b>판돈</b>이, 오른쪽 팻말에는 열 판 가운데 <b>몇 번째 판</b>인지가 적혀 있습니다."], ["다이", "접습니다. 판돈은 상대가 가져갑니다. 상대가 올렸을 때만 할 수 있습니다."], ["다음 판", "카드를 확인한 뒤 다음 판을 받습니다."])) +
    part("특별한 경우", table(["10을 들고 접으면", `접은 내 카드가 10이면 벌칙으로 ${TEN_PENALTY}개를 상대에게 더 줍니다.`], ["같은 숫자", "비기면 판돈은 그대로 두고 다음 판의 판돈에 더합니다."], ["칩이 모자라면", "가진 만큼만 내고 콜할 수 있고, 상대가 더 낸 칩은 돌려받습니다."], ["파산", "판이 끝났을 때 칩이 하나도 없으면 파산입니다. 비겨서 탁자에 판돈이 남아 있는 동안은 파산이 아닙니다."])) +
    part("화면", table(["맞은편", "흰 마네킹이 판마다 탁자의 카드를 집어 이마 위로 듭니다. 그 카드가 상대 카드입니다."], ["화면 위쪽", "내 이마에 붙은 내 카드의 뒷면이 보입니다. 판이 끝나면 탁자에 앞면으로 놓입니다."], ["칩", "빨간 칩이 내 것, 파란 칩이 상대 것, 가운데 노란 칩이 판돈입니다."])) +
    part("처음이라면", notes("상대 카드가 낮으면 내가 이길 가능성이 큽니다. 올립니다.", "상대 카드가 9나 10이면 대개 집니다. 그런데 상대가 세게 올리면 <b>내 카드가 낮다</b>는 뜻일 수도 있습니다.", "상대가 올리는 정도에서 내 카드를 짐작합니다. 컴퓨터도 가끔 허세를 부립니다.", "지나간 카드를 기억하면 남은 카드를 짐작할 수 있습니다.")),
  help: "마우스·터치: 판 위의 버튼을 누릅니다",
  sides: ["나", "컴퓨터"],
  startWord: "자리에 앉기",
};
