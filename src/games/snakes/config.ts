import type { PointConfig } from "../../ui/point-game";
import { SnakesView, TOKENS } from "./view";
import { LADDERS, SNAKES, snakes, type State } from "./rules";

export const snakesConfig: PointConfig<State> = {
  game: snakes,
  view: (host, quality) => new SnakesView(host, quality),
  colors: TOKENS as [string, string],
  name: "뱀과 사다리",
  english: "Snakes and Ladders",
  number: "NO. 17 — UP AND DOWN",
  intro: `<p>주사위를 굴려 100번 칸까지 먼저 가는 놀이.<br>사다리는 올라가고, 뱀을 만나면 미끄러집니다.</p><ul class="rule-list"><li>주사위 눈만큼 앞으로 갑니다</li><li>사다리 아래에 서면 꼭대기로 올라갑니다</li><li>뱀 머리에 서면 꼬리로 내려갑니다</li></ul>`,
  meta: `2인 · 100칸 · 사다리 ${Object.keys(LADDERS).length}개 · 뱀 ${Object.keys(SNAKES).length}마리`,
  art: `<div class="pg-mini snakes">${"<i></i>".repeat(3)}</div><span>UP THE LADDER</span>`,
  artClass: "snakes-art",
  artLabel: "뱀과 사다리 판 미리보기",
  tableLabel: "THE BOARD",
  tableNote: () => "100칸",
  rulesTitle: "100번 칸에 먼저 도착하세요",
  rules: `<ol><li>빨강이 먼저 굴립니다. 주사위 눈만큼 번호 순서대로 앞으로 갑니다. 판 밖에서 시작하므로 처음 3이 나오면 3번 칸에 섭니다.</li><li><b>사다리의 아래쪽</b> 칸에 서면 꼭대기 칸으로 올라갑니다.</li><li><b>뱀의 머리</b> 칸에 서면 꼬리 칸으로 미끄러져 내려갑니다.</li><li><b>6</b>이 나오면 한 번 더 굴립니다.</li><li>100번 칸에는 <b>딱 맞는 눈</b>이 나와야 들어갑니다. 넘치는 눈이 나오면 그 차례는 움직이지 않습니다.</li></ol><p>운으로만 겨루는 놀이라 컴퓨터 난이도는 결과에 영향을 주지 않습니다. 판이나 주사위를 누르거나 <b>주사위 굴리기</b> 버튼으로 굴립니다. 저장과 무르기는 없습니다.</p>`,
  sides: ["빨강", "파랑"],
  startWord: "테이블에 앉기",
  action: "주사위 굴리기",
  help: "마우스·터치: 판을 누르면 주사위를 굴립니다<br>키보드: 주사위 굴리기 버튼",
};
