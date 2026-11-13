import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { LEVELS, LIVES, bricks, type State } from "./rules";
import { BRICK_COLORS, BricksView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
export const bricksConfig: PointConfig<State> = {
  game: bricks,
  solo: true,
  live: true,
  noUndo: true,
  view: (host, quality) => new BricksView(host, quality),
  colors: BRICK_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("남은 공", state.lives) + stat("단계", `${state.level}/${LEVELS}`), ""],
  contact: (sound) => sound.plastic(),
  name: "벽돌깨기",
  english: "Brick Breaker",
  number: "NO. 37 — KEEP THE BALL UP",
  intro: `<p>작업대 위의 벽돌 벽과 쇠구슬 하나.<br>막대로 공을 받아 쳐서 벽돌을 모두 깨세요.</p>`,
  meta: `1인 · 벽 ${LEVELS}개 · 공 ${LIVES}개`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>KEEP THE BALL UP</span>`,
  artClass: "hexa-art",
  artLabel: "벽돌깨기 미리보기",
  tableLabel: "THE BENCH",
  tableNote: () => `벽 ${LEVELS}개 · 공 ${LIVES}개`,
  rulesTitle: "공을 떨어뜨리지 말고 벽을 깨세요",
  rules:
    part("기본 규칙", steps("먼 쪽에 벽돌이 쌓여 있고, 내 앞에는 좌우로 움직이는 <b>막대</b>가 있습니다.", "공은 막대 위에 놓인 채로 시작합니다. 띄우면 벽과 벽돌에 부딪히며 튕깁니다.", "공이 벽돌에 맞으면 <b>벽돌이 깨집니다</b>. 벽돌을 다 깨면 다음 단계의 벽이 나옵니다.", "공이 막대를 지나 <b>내 쪽 빨간 선 밖으로 나가면</b> 공 하나를 잃습니다.", `공은 ${LIVES}개입니다. 벽 ${LEVELS}개를 모두 깨면 성공, 공을 다 잃으면 끝납니다.`)) +
    part("막대와 공", table(["막대 움직이기", "마우스를 좌우로 움직이거나, 판에 손가락을 대고 좌우로 끕니다. 키보드는 ← →."], ["공 띄우기", "판을 누르거나(손가락은 떼면) 스페이스 키를 누릅니다."], ["튕기는 방향", "막대 <b>가운데</b>에 맞으면 곧게, <b>끝</b>에 맞을수록 그쪽으로 비스듬히 나갑니다."], ["남은 공", "판 오른쪽 접시에 남은 공이 놓여 있습니다."])) +
    part("벽돌과 점수", table(["색 벽돌", "한 번 맞으면 깨집니다."], ["쇠 벽돌", "회색 쇠 벽돌은 두 번 맞아야 깨집니다. 한 번 맞으면 색이 옅어집니다."], ["벽돌 하나", "10점 × 단계"], ["벽 하나", "다 깨면 100점 × 단계를 더 받습니다."], ["빨라짐", "단계가 오를수록 공이 빨라집니다."])) +
    part("처음이라면", notes("공이 내려오는 자리에 미리 가 있습니다. 공을 따라가면 늦습니다.", "막대 끝으로 받아 공을 옆으로 보내면 벽돌 사이나 벽 뒤로 들어가 한꺼번에 여러 개를 깹니다.", "마지막 남은 벽돌 한두 개는 막대의 어느 쪽에 맞힐지로 겨눕니다.")),
  help: "마우스: 좌우로 움직여 막대를 옮기고, 눌러서 공을 띄웁니다<br>터치: 손가락을 대고 좌우로 끌고, 떼면 공이 뜹니다<br>키보드: ← → 와 스페이스",
  sides: ["나", ""],
  startWord: "공 올려놓기",
};
