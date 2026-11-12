import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { MancalaView, pitAt } from "./view";
import { PITS, STONES, mancala, type State } from "./rules";

export const mancalaConfig: PointConfig<State> = {
  game: mancala,
  view: (host, quality) => new MancalaView(host, quality),
  colors: ["#c99a66", "#8e2f2a"],
  keyPoints: () => Array.from({ length: 14 }, (_, pit) => pitAt(pit)),
  name: "만칼라",
  english: "Mancala",
  number: "NO. 16 — SOW AND REAP",
  intro: `<p>사막 나라 시장의 양탄자 위에서 돌을 뿌리는 놀이.<br>내 창고에 돌을 더 많이 모으면 이깁니다.</p>`,
  meta: `2인 · 구멍 ${PITS}개씩 · 돌 ${STONES}개씩`,
  art: `<div class="pg-mini mancala">${"<i></i>".repeat(8)}</div><span>SOW AND REAP</span>`,
  artClass: "mancala-art",
  artLabel: "만칼라 판 미리보기",
  tableLabel: "THE MARKET RUG",
  tableNote: () => `구멍 ${PITS}개씩 · 돌 ${STONES * PITS * 2}개`,
  rulesTitle: "돌을 뿌려 창고에 모으세요",
  rules:
    part("기본 규칙", steps(`가까운 줄의 구멍 ${PITS}개와 오른쪽 끝의 큰 창고가 내 것입니다. 구멍마다 돌 ${STONES}개로 시작합니다.`, "차례가 오면 내 구멍 하나를 골라 그 돌을 모두 집습니다.", "<b>시계 반대 방향으로 한 구멍에 하나씩</b> 뿌립니다. 내 창고에는 넣고 상대 창고는 건너뜁니다.", "어느 한쪽의 구멍이 모두 비면 끝납니다. 남은 돌은 그 구멍 주인의 창고로 들어갑니다.", "창고의 돌이 많은 쪽이 이깁니다.")) +
    part("마지막 돌", table(["내 창고에 들어가면", "한 번 더 둡니다."], ["비어 있던 내 구멍에 떨어지면", "맞은편 구멍에 돌이 있을 때, 그 돌과 마지막 돌을 모두 내 창고로 가져옵니다."], ["그 밖의 자리", "차례가 넘어갑니다."])) +
    part("처음이라면", notes("창고에서 돌 수만큼 떨어진 구멍을 고르면 마지막 돌이 창고에 들어가 한 번 더 둡니다.", "빈 구멍 맞은편에 상대 돌이 많이 쌓였는지 살핍니다.", "오른쪽 구멍에 돌을 너무 많이 모으면 상대 쪽으로 넘어갑니다.")) +
    part("그 밖에", notes("구멍 옆의 숫자는 그 안의 돌 수입니다.", "새 게임 설정에서 대전 방식과 컴퓨터 난이도를 고릅니다.", "<b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  sides: ["아래쪽", "위쪽"],
  startWord: "시장에 앉기",
  help: "마우스·터치: 내 구멍을 누르면 돌을 뿌립니다<br>키보드: 판을 선택하고 방향키·Enter",
};
