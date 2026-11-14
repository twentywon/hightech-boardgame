import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { COLS, LEVELS, LIVES, MAX_LIVES, bricks, layout, wall, type State } from "./rules";
import { BRICK_COLORS, BricksView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
const BRICK_PAINT: Record<string, string> = { h: "#8d979e", t: "#b0722f", s: "#23282d", b: "#ff5a2a" },
  ROW_PAINT = ["#b8433a", "#d06a3a", "#e0a92a", "#7a9a3a", "#2f9f8f", "#3f7fc0"];
/** A small picture of a wall: its bricks as they stand, with an arrow beside a row that slides. */
function wallArt(level: number) {
  const bricks = layout(level)
      .map(({ col, row, kind }) => `<rect x="${10 + col * 13.4}" y="${14 + row * 9}" width="12" height="7.4" rx="1.4" fill="${BRICK_PAINT[kind] ?? ROW_PAINT[row % ROW_PAINT.length]}"/>`)
      .join(""),
    arrows = wall(level)
      .sway.map((sway, row) => (sway ? `<path d="M${sway > 0 ? 124 : 136} ${15.5 + row * 9} l${sway > 0 ? 8 : -8} 2.5 l${sway > 0 ? -8 : 8} 2.5 z" fill="#ffd24a"/>` : ""))
      .join("");
  return `<svg viewBox="0 0 ${COLS * 13.4 + 30} 140" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="${COLS * 13.4 + 26}" height="132" rx="10" fill="#2f3a40" stroke="#b98a4e" stroke-width="4"/>${bricks}${arrows}<rect x="${(COLS * 13.4 + 30) / 2 - wall(level).bat * 16}" y="118" width="${wall(level).bat * 32}" height="5" rx="2.5" fill="#f0ede4"/><circle cx="${(COLS * 13.4 + 30) / 2}" cy="112" r="2.6" fill="#f2f4f5"/></svg>`;
}
export const bricksConfig: PointConfig<State> = {
  // 새 게임 asks which wall to begin at, and shows each.
  stages: Array.from({ length: LEVELS }, (_, i) => i + 1).map((level) => ({ value: String(level), name: `${level}단계`, note: ["색 벽돌", "엇갈린 무늬", "쇠 벽돌", "폭탄", "강철", "움직이는 줄", "구리 벽돌", "이어 터지는 폭탄", "요새", "전부"][level - 1], art: wallArt(level) })),
  game: bricks,
  solo: true,
  live: true,
  pausable: true,
  newGameLabel: "레벨 선택",
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
    part("기본 규칙", steps("먼 쪽에 벽돌이 쌓여 있고, 내 앞에는 좌우로 움직이는 <b>막대</b>가 있습니다.", "공은 막대 위에 놓인 채로 시작합니다. 띄우면 벽과 벽돌에 부딪히며 튕깁니다.", "공이 벽돌에 맞으면 <b>벽돌이 깨집니다</b>. 깰 수 있는 벽돌을 다 깨면 다음 단계의 벽이 나옵니다.", "공이 막대를 지나 <b>내 쪽 빨간 선 밖으로 나가면</b> 공 하나를 잃습니다.", `공은 ${LIVES}개로 시작합니다. 벽 ${LEVELS}개를 모두 깨면 성공, 공을 다 잃으면 끝납니다.`, "단계가 오를수록 <b>공은 빨라지고 막대는 짧아지며</b>, 새로운 벽돌이 나옵니다.")) +
    part("막대와 공", table(["막대 움직이기", "마우스를 좌우로 움직이거나, 판에 손가락을 대고 좌우로 끕니다. 키보드는 ← →."], ["공 띄우기", "판을 누르거나(손가락은 떼면) 스페이스 키를 누릅니다."], ["튕기는 방향", "막대 <b>가운데</b>에 맞으면 곧게, <b>끝</b>에 맞을수록 그쪽으로 비스듬히 나갑니다."], ["남은 공", "판 오른쪽 접시에 남은 공이 놓여 있습니다."])) +
    part("벽돌", table(["색 벽돌", "한 번 맞으면 깨집니다."], ["쇠 벽돌", "회색 쇠 벽돌은 두 번 맞아야 깨집니다. 한 번 맞으면 색이 옅어집니다. (3단계부터)"], ["구리 벽돌", "구릿빛 벽돌은 세 번 맞아야 깨집니다. 맞을 때마다 회색, 옅은 회색으로 바뀝니다. (7단계부터)"], ["폭탄 벽돌", "불꽃이 그려진 검은 벽돌. 깨지면 <b>둘레의 벽돌까지 함께</b> 터집니다. 폭탄끼리는 이어서 터집니다. (4단계부터)"], ["강철 벽돌", "새까만 강철은 <b>깨지지 않습니다</b>. 깨지 않아도 단계가 넘어갑니다. 틈으로 공을 보내야 합니다. (5단계부터)"], ["움직이는 줄", "벽돌 줄이 좌우로 미끄러집니다. 줄마다 방향이 다릅니다. (6단계부터)"])) +
    part("떨어지는 아이템", table(["받는 법", "벽돌이 깨질 때 가끔 글자가 적힌 판이 내 쪽으로 내려옵니다. <b>막대로 받으면</b> 효과가 생기고 50점을 얻습니다. 놓치면 사라집니다."], ["넓게", "막대가 한동안 넓어집니다."], ["×3", "공이 세 개로 갈라집니다. 하나라도 남아 있으면 공을 잃지 않습니다."], ["느리게", "공이 한동안 느려집니다(파랗게 빛남)."], ["관통", "공이 한동안 벽돌을 뚫고 지나가며 깹니다(주황으로 빛남). 강철은 못 뚫습니다."], ["+1", `공 하나를 더 얻습니다(최대 ${MAX_LIVES}개).`], ["좁게", "빨간 판. 막대가 한동안 <b>좁아집니다</b>. 피하는 편이 좋습니다. (4단계부터)"], ["사라질 때", "공을 잃거나 단계가 넘어가면 진행 중이던 효과는 끝납니다."])) +
    part("시작 단계", table(["고르기", "위쪽의 <b>레벨 선택</b>을 누르면 열 단계의 벽 모양이 그림으로 나옵니다. 그림을 눌러 그 단계부터 시작합니다."], ["처음 앉을 때", "1단계부터 시작합니다."])) +
    part("점수", table(["벽돌 하나", "10점 × 단계"], ["벽 하나", "다 깨면 100점 × 단계를 더 받습니다."], ["아이템", "받을 때마다 50점."])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다. 화면이 어두워집니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누르면 멈춘 자리에서 이어집니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("공이 내려오는 자리에 미리 가 있습니다. 공을 따라가면 늦습니다.", "막대 끝으로 받아 공을 옆으로 보내면 벽돌 사이나 벽 뒤로 들어가 한꺼번에 여러 개를 깹니다.", "아이템을 받으려다 공을 놓치지 않습니다. 공이 먼저입니다.", "폭탄 벽돌을 먼저 노리면 둘레가 한꺼번에 비워집니다.")),
  help: "마우스: 좌우로 움직여 막대를 옮기고, 눌러서 공을 띄웁니다<br>터치: 손가락을 대고 좌우로 끌고, 떼면 공이 뜹니다<br>키보드: ← → 와 스페이스",
  sides: ["나", ""],
  startWord: "공 올려놓기",
};
