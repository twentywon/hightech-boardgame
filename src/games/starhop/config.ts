import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOLES, starHop, type State } from "./rules";
import { STAR_COLORS, StarHopView, holeAt } from "./view";

export const starHopConfig: PointConfig<State> = {
  game: starHop,
  view: (host, quality) => new StarHopView(host, quality),
  colors: STAR_COLORS,
  keyPoints: () => HOLES.map((_, i) => holeAt(i)),
  keyStart: (state) => state.cells.findIndex((owner) => owner === state.turn),
  showMovable: false,
  name: "차이니즈 체커",
  english: "Chinese Checkers",
  number: "NO. 30 — HOP ACROSS",
  intro: `<p>흰 테이블 위의 별 모양 판.<br>구슬 열 개를 맞은편 꼭짓점으로 먼저 모두 옮기세요.</p><ul class="rule-list"><li>옆 구멍으로 한 칸, 또는 구슬 하나를 뛰어넘기</li><li>뛰어넘기는 이어서 여러 번 할 수 있습니다</li><li>잡는 수는 없습니다</li></ul>`,
  meta: "2인 · 구멍 121개 · 구슬 10개씩",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>HOP AND HOP AGAIN</span>`,
  artClass: "starhop-art",
  artLabel: "차이니즈 체커 판 미리보기",
  tableLabel: "THE WHITE TABLE",
  tableNote: () => "구슬 10개씩 · 빨강 선공",
  rulesTitle: "뛰어넘어 맞은편 집으로",
  rules:
    part("기본 규칙", steps("여섯 꼭짓점 별 모양 판에 구멍이 121개 있습니다. 두 사람이 마주 보는 꼭짓점(집)에 구슬 열 개씩을 놓고 시작합니다.", "<b>빨강(가까운 쪽)이 먼저</b> 두고 번갈아 구슬 하나를 옮깁니다.", "구슬 열 개를 <b>맞은편 꼭짓점</b>의 열 구멍에 먼저 모두 넣으면 이깁니다.", "구슬을 잡거나 판에서 치우는 일은 없습니다.")) +
    part("구슬 옮기기", table(["한 칸", "여섯 방향 가운데 바로 옆의 빈 구멍으로 갑니다."], ["뛰어넘기", "바로 옆에 구슬(내 것이든 상대 것이든)이 있고 그 너머 구멍이 비어 있으면 뛰어넘습니다."], ["이어 뛰기", "뛰어넘은 자리에서 또 뛰어넘을 수 있으면 <b>한 차례에 몇 번이든</b> 이어 뜁니다. 원하는 곳에서 멈춰도 됩니다."], ["섞어 쓰기", "한 차례에 한 칸 가기와 뛰어넘기를 함께 할 수는 없습니다."])) +
    part("화면", table(["고르기", "내 구슬을 누르면 갈 수 있는 구멍에 금색 고리가 뜹니다. 이어 뛰어 닿는 곳도 모두 뜹니다."], ["옆 패널", "맞은편 집에 들어간 구슬 수가 나옵니다."])) +
    part("처음이라면", notes("구슬을 한 줄로 띄엄띄엄 놓으면 뒤의 구슬이 그 위를 사다리처럼 타고 한 번에 멀리 갑니다.", "상대 구슬도 발판입니다. 가운데에서 서로의 구슬을 넘으며 갑니다.", "맨 뒤에 처진 구슬을 남겨 두면 끝에 한 칸씩 가야 해서 늦습니다.", `${400}수가 지나도록 끝나지 않으면 무승부입니다.`)),
  sides: ["빨강", "파랑"],
  startWord: "테이블에 앉기",
};
