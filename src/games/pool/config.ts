import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { pool, type State } from "./rules";
import { POOL_COLORS, PoolView } from "./view";

export const poolConfig: PointConfig<State> = {
  game: pool,
  view: (host, quality) => new PoolView(host, quality),
  colors: POOL_COLORS,
  noUndo: true,
  shape: "tall",
  // Balls click against each other.
  contact: (sound) => sound.plastic(),
  name: "포켓볼",
  english: "Pocket Ball",
  number: "NO. 32 — EIGHT BALL",
  intro: `<p>펍 한쪽의 당구대.<br>흰 공을 쳐서 내 공 일곱 개를 넣고, 마지막에 검은 8번을 넣으세요.</p><ul class="rule-list"><li>먼저 들어간 공으로 단색·줄무늬가 정해집니다</li><li>내 공을 넣으면 한 번 더 칩니다</li><li>8번을 일찍 넣으면 집니다</li></ul>`,
  meta: "2인 · 공 15개 · 구멍 6개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>CALL THE EIGHT</span>`,
  artClass: "pool-art",
  artLabel: "포켓볼 당구대 미리보기",
  tableLabel: "THE PUB TABLE",
  tableNote: () => "에이트볼 · 구멍 6개",
  rulesTitle: "일곱 개를 넣고, 8번으로 끝내세요",
  rules:
    part("기본 규칙", steps("단색 공 일곱 개(1–7), 줄무늬 공 일곱 개(9–15), 검은 <b>8번</b>, 그리고 치는 <b>흰 공</b>이 있습니다. 구멍은 여섯 개입니다.", "<b>내가 먼저</b> 흰 공을 쳐서 모여 있는 공을 깹니다.", "처음으로 공이 들어가면 그 공의 종류가 넣은 사람의 것이 되고, 다른 종류는 상대의 것이 됩니다.", "<b>내 종류의 공</b>을 넣으면 한 번 더 칩니다. 못 넣으면 차례가 넘어갑니다.", "내 공 일곱 개를 모두 넣은 뒤 <b>8번</b>을 넣으면 이깁니다.")) +
    part("치는 법", table(["당기기", "흰 공을 누른 채 <b>보낼 쪽의 반대로</b> 당깁니다. 큐를 뒤로 빼는 것과 같습니다."], ["세기", "멀리 당길수록 셉니다. 노란 막대가 방향과 세기를 보여 줍니다."], ["놓기", "손을 떼면 나갑니다."])) +
    part("반칙과 패배", table(["흰 공이 빠지면", "반칙입니다. 차례가 넘어가고 흰 공은 당구대 앞쪽 점에 다시 놓입니다."], ["8번을 일찍 넣으면", "내 공이 남아 있는데 8번을 넣으면 그 자리에서 집니다."], ["8번과 흰 공이 함께", "8번을 넣는 샷에 흰 공도 빠지면 집니다."], ["상대 공을 넣으면", "그 공은 상대가 넣은 것으로 칩니다. 내 공이 함께 들어가지 않았다면 차례가 넘어갑니다."])) +
    part("화면", table(["단색", "색이 꽉 찬 공. 번호 1–7."], ["줄무늬", "흰 바탕에 색 띠가 있는 공. 번호 9–15."], ["옆 패널", "내 종류와 남은 공 수가 나옵니다."])) +
    part("처음이라면", notes("넣을 공과 구멍을 잇는 줄을 그리고, 그 줄의 반대편에서 공을 맞힙니다.", "세게 치면 흰 공까지 구멍에 빠지기 쉽습니다.", "8번 가까이에 있는 내 공은 조심해서 칩니다. 8번이 먼저 들어가면 집니다.", "넣기 어려우면 흰 공을 상대가 치기 나쁜 자리에 세워 둡니다.")),
  help: "마우스·터치: 흰 공을 누른 채 뒤로 당겼다 놓습니다",
  sides: ["나", "상대"],
  startWord: "큐를 잡기",
};
