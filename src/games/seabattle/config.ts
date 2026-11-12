import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, FLEET, LAY_REST, TURN_SHIP, seaBattle, type State } from "./rules";
import { SEA_COLORS, SeaBattleView, seaPoints } from "./view";

export const seaBattleConfig: PointConfig<State> = {
  game: seaBattle,
  // My own chart lies open; the computer's ships stay hidden until they go down.
  view: (host, quality) => new SeaBattleView(host, quality, [true, false]),
  // One screen cannot hide two fleets from two players: the game is played against the computer only.
  computerOnly: true,
  tools: [
    { label: "배 돌리기 (가로 ↔ 세로)", point: TURN_SHIP },
    { label: "남은 배 무작위로 놓기", point: LAY_REST },
  ],
  firstNote: "내 배 다섯 척을 놓은 뒤, 내가 먼저 쏩니다.",
  // A miss falls into the sea; a hit goes off.
  contact: (sound, state) => (state.last?.hit ? sound.explosion() : sound.splash()),
  shape: "taller",
  colors: SEA_COLORS,
  keyPoints: seaPoints,
  // The keyboard starts in the waters the player to move fires at.
  keyStart: (state) => (state.phase === "battle" && state.turn === 0 ? CELLS + 44 : 44),
  // Once the fleet is laid, the keyboard moves over to the waters to fire at.
  rehome: (before, next) => before.phase !== next.phase,
  name: "배틀십",
  english: "Battleship",
  number: "NO. 20 — HIDDEN FLEETS",
  intro: `<p>지하 작전실, 탁자 위의 해도 두 장.<br>보이지 않는 상대 함대를 한 칸씩 쏘아 모두 가라앉히세요.</p>`,
  meta: `2인 · 10×10 해도 두 장 · 배 ${FLEET.length}척`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FIND AND SINK</span>`,
  artClass: "seabattle-art",
  artLabel: "배틀십 해도 미리보기",
  tableLabel: "THE WAR ROOM",
  tableNote: () => `10 × 10 · 배 ${FLEET.length}척`,
  rulesTitle: "숨은 함대를 찾아 가라앉히세요",
  rules:
    part("기본 규칙", steps(`각자 10×10 해도에 배 ${FLEET.length}척을 숨겨 둡니다. 배는 가로나 세로로 놓이고 서로 겹치지 않습니다.`, "먼저 <b>내 배를 놓습니다</b>. 컴퓨터의 배는 저절로 놓입니다.", "배를 다 놓으면 <b>내가(청군) 먼저</b> 쏘고 번갈아 <b>상대 해역의 한 칸</b>을 쏩니다. 같은 칸은 두 번 쏠 수 없습니다.", "배가 있는 칸이면 <b>명중</b>, 없으면 <b>빗나감</b>입니다.", "배의 모든 칸이 맞으면 그 배는 <b>격침</b>되어 모습이 드러납니다.", "상대의 배를 먼저 모두 가라앉히면 이깁니다.")) +
    part("배 놓기", table(["순서", "긴 배부터 한 척씩 놓습니다. 내 해역의 칸을 누르면 그 칸에서 오른쪽(가로)이나 아래쪽(세로)으로 놓입니다."], ["배 돌리기", "다음 배를 가로로 놓을지 세로로 놓을지 바꿉니다."], ["남은 배 무작위로 놓기", "아직 놓지 않은 배를 한꺼번에 아무 데나 놓습니다."], ["무르기", "방금 놓은 배를 다시 듭니다."], ["미리 보기", "마우스를 올리거나 방향키로 옮기면 놓일 자리가 노랗게 보입니다."])) +
    part("함대", table(...FLEET.map(([name, length]): [string, string] => [name, `${length}칸`]))) +
    part("표시", table(["빨간 말뚝", "명중한 칸"], ["흰 말뚝", "빗나간 칸"], ["검게 탄 배", "격침된 배. 어느 쪽 배든 격침되면 보입니다."], ["노란 고리", "마지막으로 쏜 칸"])) +
    part("해도", table(["청군 해역", "왼쪽(좁은 화면에서는 아래). 내 것이며 내 배가 보입니다."], ["홍군 해역", "오른쪽(좁은 화면에서는 위). 컴퓨터의 것이며 여기를 쏩니다."])) +
    part("처음이라면", notes("명중하면 그 칸의 <b>위·아래·왼쪽·오른쪽</b>을 이어서 쏩니다. 두 칸이 이어 맞으면 그 줄을 따라갑니다.", "찾을 때는 <b>한 칸씩 건너</b> 바둑판 무늬로 쏘면 가장 작은 배도 놓치지 않습니다.", "남은 배 가운데 가장 긴 배가 들어갈 수 없는 좁은 틈은 쏠 필요가 없습니다.")) +
    part("그 밖에", notes("한 화면에서는 서로의 배를 가릴 수 없어 컴퓨터 대전만 있습니다.", "빗나가면 풍덩, 명중하면 폭발 소리가 납니다.", "컴퓨터는 자기가 쏜 결과와 격침된 배만 보고 쏩니다. 내 배의 위치는 알지 못합니다.", "무르기는 숨은 배를 알아내는 데 쓸 수 있으니 연습용으로만 쓰세요.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  help: "배 놓기: 내 해역의 칸을 누르면 그 칸부터 놓입니다<br>마우스·터치: 상대 해역의 칸을 누르면 바로 쏩니다<br>키보드: 판을 선택하고 방향키로 칸 이동, Enter로 발사",
  sides: ["청군", "홍군"],
  startWord: "작전실에 들어가기",
};
