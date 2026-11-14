import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { carrom, type State } from "./rules";
import { CarromView, MEN_COLORS } from "./view";

export const carromConfig: PointConfig<State> = {
  game: carrom,
  noPanel: true,
  view: (host, quality) => new CarromView(host, quality),
  colors: MEN_COLORS,
  noUndo: true,
  contact: (sound) => sound.plastic(),
  name: "카롬",
  english: "Carrom",
  number: "NO. 26 — STRIKE AND POCKET",
  intro: `<p>흰 대리석 바닥 위의 카롬 판.<br>스트라이커를 튕겨 내 말을 네 귀퉁이 구멍에 넣습니다.</p>`,
  meta: "2인 · 말 9개씩 · 여왕 1개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>STRIKE AND POCKET</span>`,
  artClass: "carrom-art",
  artLabel: "카롬 판 미리보기",
  tableLabel: "THE MARBLE COURT",
  tableNote: () => "말 9개씩 · 흰 말 선공",
  rulesTitle: "스트라이커로 내 말을 구멍에",
  rules:
    part("기본 규칙", steps("판 가운데에 흰 말 9개, 검은 말 9개, 빨간 <b>여왕</b> 1개가 모여 있습니다. 구멍은 네 귀퉁이에 있습니다.", "<b>흰 말이 먼저</b> 칩니다. 컴퓨터 대전에서는 내가 흰 말입니다.", "차례마다 내 쪽 <b>밑줄</b> 위에 스트라이커를 놓고 튕깁니다. 앞쪽(상대 쪽)으로만 칠 수 있습니다.", "<b>내 색 말</b>을 구멍에 넣으면 한 번 더 칩니다. 넣지 못하면 차례가 넘어갑니다.", "내 말 아홉 개를 <b>먼저 모두</b> 넣으면 이깁니다.")) +
    part("치는 법", table(["자리 잡기", "밑줄 위의 원하는 곳을 누르면 스트라이커가 그리로 옮겨집니다. 말과 겹치는 자리에는 설 수 없습니다."], ["당기기", "스트라이커를 누른 채 <b>보낼 쪽의 반대로</b> 당깁니다. 멀리 당길수록 셉니다."], ["놓기", "손을 떼면 나갑니다. 뒤쪽으로는 칠 수 없고, 벽에 맞으면 튕겨 나옵니다."])) +
    part("여왕", table(["넣으면", "한 번 더 칩니다."], ["덮기", "여왕을 넣은 <b>그 샷이나 바로 다음 샷</b>에 내 말을 하나 넣어야 여왕이 내 것이 됩니다."], ["못 덮으면", "여왕은 판 가운데로 돌아옵니다."])) +
    part("반칙", table(["스트라이커가 빠지면", "차례가 넘어가고, 넣었던 내 말 하나가 판 가운데로 돌아옵니다. 덮지 못한 여왕도 돌아옵니다."], ["상대 말을 넣으면", "그 말은 상대가 넣은 것으로 칩니다. 차례는 넘어갑니다."])) +
    part("처음이라면", notes("말과 구멍을 잇는 줄을 그려 보고, 그 줄의 반대편에서 말을 맞힙니다.", "세게 치면 스트라이커까지 구멍에 빠지기 쉽습니다. 넣을 만큼만 칩니다.", "밑줄에서 스트라이커의 자리를 바꾸면 치기 좋은 각도가 생깁니다.", "여왕은 내 말이 구멍 가까이에 하나 더 있을 때 노립니다.")),
  help: "마우스·터치: 밑줄을 눌러 스트라이커를 옮기고, 스트라이커를 당겼다 놓습니다",
  sides: ["흰 말", "검은 말"],
  startWord: "판 앞에 앉기",
};
