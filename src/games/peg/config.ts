import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { pegBoard } from "./board";
import { STAGES, left, createGame, peg, type State } from "./rules";

export const pegConfig: PointConfig<State> = {
  game: peg,
  board: pegBoard,
  solo: true,
  noPanel: true,
  showMovable: false,
  // The stages: the whole board, and five set problems with fewer marbles.
  variants: Object.entries(STAGES).map(([value, stage]) => ({ value, label: `${stage.name} · 구슬 ${left(createGame(value))}개` })),
  variantLabel: "스테이지",
  autoSingle: false,
  name: "페그 솔리테어",
  english: "Peg Solitaire",
  number: "NO. 38 — ONE LEFT",
  intro: `<p>혼자 두는 오래된 구슬 퍼즐.<br>구슬로 구슬을 뛰어넘어 하나씩 덜어 내고, 마지막 한 개만 남기세요.</p>`,
  meta: "1인 · 구멍 33개 · 스테이지 여섯 개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>ONE LEFT</span>`,
  artClass: "morris-art",
  artLabel: "페그 솔리테어 판 미리보기",
  tableLabel: "THE MARBLE BOARD",
  tableNote: (variant) => `${(STAGES[variant] ?? STAGES.full).name} · 구멍 33개`,
  rulesTitle: "뛰어넘어 하나만 남기세요",
  rules:
    part("기본 규칙", steps("십자 모양 판에 구멍이 33개 있습니다. 기본 스테이지는 <b>한가운데만 비우고</b> 구슬 32개를 놓고 시작합니다.", "구슬 하나를 골라 <b>바로 옆 구슬을 뛰어넘어</b> 그 너머의 빈 구멍에 놓습니다.", "뛰어넘긴 구슬은 판에서 덜어 냅니다.", "가로와 세로로만 뛸 수 있습니다. 대각선으로는 뛰지 못합니다.", "<b>구슬이 하나만 남으면 성공</b>입니다. 더 뛸 수 있는 구슬이 없는데 둘 이상 남으면 실패입니다.")) +
    part("뛰기", table(["고르기", "움직일 구슬을 누릅니다. 뛸 수 있는 빈 구멍이 표시됩니다."], ["놓기", "표시된 빈 구멍을 누르면 뛰어넘고, 사이의 구슬이 사라집니다."], ["다시 고르기", "다른 구슬을 누르면 고른 구슬이 바뀝니다."], ["무르기", "한 수씩 되돌릴 수 있습니다. 끝까지 되돌려도 됩니다."])) +
    part("스테이지", table(["기본", "한가운데만 빈 판. 구슬 32개."], ["십자가", "구슬 6개. 가장 쉽습니다."], ["더하기", "구슬 9개."], ["벽난로", "구슬 11개."], ["피라미드", "구슬 16개."], ["다이아몬드", "구슬 24개."], ["고르기", "시작하기 전이나 '새 게임'에서 스테이지를 고릅니다. 어느 스테이지든 하나만 남길 수 있습니다."])) +
    part("결과", table(["한가운데에 하나", "마지막 구슬이 한가운데 구멍에 남으면 가장 완벽한 풀이입니다."], ["어디든 하나", "한 개만 남기면 성공입니다."], ["둘 이상", "뛸 수 없게 되면 남은 구슬 수가 나옵니다. 적을수록 잘한 것입니다."])) +
    part("처음이라면", notes("바깥쪽 구슬부터 안으로 모으듯이 덜어 냅니다. 구석에 혼자 남은 구슬은 다시 쓰기 어렵습니다.", "구슬이 서로 떨어져 흩어지지 않게 합니다. 이웃이 없는 구슬은 뛸 수도, 뛰어넘길 수도 없습니다.", "막히면 무르기로 몇 수 되돌려 다른 길을 찾아봅니다.")),
  help: "마우스·터치: 구슬을 누른 뒤 빈 구멍을 누릅니다<br>키보드: 판을 선택하고 방향키·Enter, Escape로 취소",
  sides: ["나", ""],
  startWord: "판 앞에 앉기",
};
