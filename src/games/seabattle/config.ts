import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, FLEET, seaBattle, type State } from "./rules";
import { SEA_COLORS, SeaBattleView, seaPoints } from "./view";

export const seaBattleConfig: PointConfig<State> = {
  game: seaBattle,
  // Against the computer my own chart lies open; two players at one screen both keep theirs covered.
  view: (host, quality, _variant, mode) => new SeaBattleView(host, quality, [mode === "ai", false]),
  shape: "taller",
  colors: SEA_COLORS,
  keyPoints: seaPoints,
  // The keyboard starts in the waters the player to move fires at.
  keyStart: (state) => (state.turn === 0 ? CELLS + 44 : 44),
  name: "해전",
  english: "Sea Battle",
  number: "NO. 20 — HIDDEN FLEETS",
  intro: `<p>지하 작전실, 탁자 위의 해도 두 장.<br>보이지 않는 상대 함대를 한 칸씩 쏘아 모두 가라앉히세요.</p><ul class="rule-list"><li>배 다섯 척은 저절로 숨겨 놓입니다</li><li>번갈아 한 칸씩 쏩니다</li><li>빨간 말뚝은 명중, 흰 말뚝은 빗나감</li></ul>`,
  meta: `2인 · 10×10 해도 두 장 · 배 ${FLEET.length}척`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FIND AND SINK</span>`,
  artClass: "seabattle-art",
  artLabel: "해전 해도 미리보기",
  tableLabel: "THE WAR ROOM",
  tableNote: () => `10 × 10 · 배 ${FLEET.length}척`,
  rulesTitle: "숨은 함대를 찾아 가라앉히세요",
  rules:
    part("기본 규칙", steps(`각자 10×10 해도에 배 ${FLEET.length}척을 숨겨 둡니다. 배는 시작할 때 <b>저절로</b> 놓이며, 가로나 세로로 놓이고 서로 겹치지 않습니다.`, "<b>청군이 먼저</b> 쏘고 번갈아 <b>상대 해역의 한 칸</b>을 쏩니다. 같은 칸은 두 번 쏠 수 없습니다.", "배가 있는 칸이면 <b>명중</b>, 없으면 <b>빗나감</b>입니다.", "배의 모든 칸이 맞으면 그 배는 <b>격침</b>되어 모습이 드러납니다.", "상대의 배를 먼저 모두 가라앉히면 이깁니다.")) +
    part("함대", table(...FLEET.map(([name, length]): [string, string] => [name, `${length}칸`]))) +
    part("표시", table(["빨간 말뚝", "명중한 칸"], ["흰 말뚝", "빗나간 칸"], ["검게 탄 배", "격침된 배. 어느 쪽 배든 격침되면 보입니다."], ["노란 고리", "마지막으로 쏜 칸"])) +
    part("해도", table(["컴퓨터 대전", "왼쪽(좁은 화면에서는 아래) <b>청군 해역</b>이 내 것이며 내 배가 보입니다. 오른쪽(위) <b>홍군 해역</b>을 쏩니다."], ["로컬 2인", "두 해도 모두 배를 가린 채 둡니다. 청군은 홍군 해역을, 홍군은 청군 해역을 쏩니다."])) +
    part("처음이라면", notes("명중하면 그 칸의 <b>위·아래·왼쪽·오른쪽</b>을 이어서 쏩니다. 두 칸이 이어 맞으면 그 줄을 따라갑니다.", "찾을 때는 <b>한 칸씩 건너</b> 바둑판 무늬로 쏘면 가장 작은 배도 놓치지 않습니다.", "남은 배 가운데 가장 긴 배가 들어갈 수 없는 좁은 틈은 쏠 필요가 없습니다.")) +
    part("그 밖에", notes("배를 손으로 놓는 기능은 없습니다. 새 게임을 시작할 때마다 새로 놓입니다.", "컴퓨터는 자기가 쏜 결과와 격침된 배만 보고 쏩니다. 내 배의 위치는 알지 못합니다.", "무르기는 숨은 배를 알아내는 데 쓸 수 있으니 연습용으로만 쓰세요.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  help: "마우스·터치: 상대 해역의 칸을 누르면 바로 쏩니다<br>키보드: 판을 선택하고 방향키로 칸 이동, Enter로 발사",
  sides: ["청군", "홍군"],
  startWord: "작전실에 들어가기",
};
