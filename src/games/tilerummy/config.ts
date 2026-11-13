import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DRAW, END, NEW_SET, OPENING, RACK_SIZE, REGROUP, RESET, tileRummy, type State } from "./rules";
import { RACK_COLORS, TileRummyView } from "./view";

export const tileRummyConfig: PointConfig<State> = {
  game: tileRummy,
  noPanel: true,
  view: (host, quality) => new TileRummyView(host, quality),
  colors: RACK_COLORS,
  // The other rack and the pool are hidden: against the computer only, and nothing is taken back but this turn's own work.
  computerOnly: true,
  noUndo: true,
  showMovable: false,
  tools: [
    { label: "새 묶음으로 내기", point: NEW_SET },
    { label: "재구성", point: REGROUP },
    { label: "차례 마치기", point: END },
    { label: "한 장 가져오기", point: DRAW },
    { label: "이번 차례 되돌리기", point: RESET },
  ],
  firstNote: "내가 먼저 합니다.",
  name: "타일 러미",
  english: "Tile Rummy",
  number: "NO. 29 — SETS AND RUNS",
  intro: `<p>흔히 '루미큐브'로 알려진 놀이 방식입니다. 교실 바닥에 타일을 펼쳐 놓고,<br>같은 숫자끼리 또는 이어지는 숫자끼리 묶어 내 타일을 먼저 다 내려놓으세요.</p>`,
  meta: `나 대 컴퓨터 · 타일 106개 · ${RACK_SIZE}개씩`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>GROUPS AND RUNS</span>`,
  artClass: "tilerummy-art",
  artLabel: "타일 러미 미리보기",
  tableLabel: "THE CLASSROOM FLOOR",
  tableNote: () => `타일 106개 · 첫 등록 ${OPENING}점`,
  rulesTitle: "묶고, 풀고, 다시 짜서 먼저 비우세요",
  rules:
    part("기본 규칙", steps(`1–13의 숫자가 네 가지 색으로 두 벌씩(104개), 조커 2개가 있습니다. 각자 ${RACK_SIZE}개를 받고 나머지는 엎어 둡니다.`, "<b>내가 먼저</b> 합니다. 차례마다 내 타일을 <b>묶음</b>으로 판에 내려놓습니다.", "낼 것이 없거나 내고 싶지 않으면 <b>한 장 가져오고</b> 차례를 넘깁니다.", "차례를 마칠 때 판 위의 <b>모든 묶음이 맞아야</b> 합니다.", "내 타일을 <b>먼저 모두</b> 내려놓으면 이깁니다.")) +
    part("묶음", table(["같은 숫자", "같은 숫자를 <b>서로 다른 색</b>으로 3개 또는 4개. 예: 빨강 7, 파랑 7, 검정 7."], ["이어지는 숫자", "<b>같은 색</b>으로 숫자가 이어지는 3개 이상. 예: 파랑 4, 5, 6, 7. 13 다음에 1로 이어지지는 않습니다."], ["조커", "어떤 타일 대신으로든 쓸 수 있습니다."], ["틀린 묶음", "바닥이 붉게 보입니다. 그대로는 차례를 마칠 수 없습니다."])) +
    part("첫 등록", table(["조건", `처음 내려놓을 때는 <b>내 타일만으로</b> 만든 묶음의 숫자 합이 ${OPENING}점 이상이어야 합니다. 조커는 대신하는 타일의 숫자로 셉니다.`], ["등록 전", "판에 있던 묶음에 붙이거나 그 묶음을 건드릴 수 없습니다."], ["등록 후", "판의 묶음에 타일을 붙이고, 묶음을 풀어 다시 짤 수 있습니다."])) +
    part("타일 내는 법", table(["새 묶음 내기", "내 타일 가운데 낼 것들을 <b>하나씩 눌러 고릅니다</b>(고른 타일은 떠오릅니다). 고른 타일이 묶음이 되면 판에 <b>새 묶음으로 내기</b> 버튼이 뜹니다."], ["판의 묶음에 붙이기", "내 타일 하나를 누르면, 그 타일을 붙일 수 있는 묶음 끝에 <b>금색 칸</b>이 뜹니다. 금색 칸을 누르면 붙습니다. 붙일 곳이 없으면 칸이 뜨지 않습니다."], ["재구성", "바닥에 놓인 타일들을 눌러 고르고 내 타일도 눌러 고릅니다. 고른 타일이 묶음이 되면 <b>재구성</b> 버튼이 뜨고, 누르면 그 타일들이 새 묶음이 됩니다. 타일을 내준 묶음이 틀려지면 바닥이 붉어지니 이어서 고쳐 짭니다."], ["고르기 취소", "떠오른 타일을 다시 누르면 내려갑니다."], ["도로 가져오기", "이번 차례에 낸 내 타일을 고르면 받침대 옆에 금색 칸이 뜹니다. 누르면 되가져옵니다."])) +
    part("판 위의 버튼", table(["새 묶음으로 내기", "고른 내 타일이 맞는 묶음일 때만 뜹니다."], ["재구성", "판의 타일이 섞인 고른 타일들이 맞는 묶음일 때만 뜹니다."], ["차례 마치기", "모든 묶음이 맞고 내 타일을 하나 이상 내려놓았을 때 뜹니다."], ["한 장 가져오기", "아무것도 내려놓지 않았을 때만 뜹니다. 가져오면 차례가 끝납니다."], ["이번 차례 되돌리기", "이번 차례에 고르고 옮긴 것을 모두 처음대로 돌립니다."])) +
    part("끝", table(["승리", "받침대를 먼저 비운 쪽."], ["더미가 비면", "두 사람이 잇달아 아무것도 못 내면 끝나고, 남은 타일의 숫자 합이 적은 쪽이 이깁니다. 조커는 30으로 셉니다."])) +
    part("처음이라면", notes(`첫 등록 ${OPENING}점은 10 이상의 숫자 셋이면 채워집니다.`, "판의 긴 줄에서 끝 타일을 떼어 내 타일과 새 묶음을 만들 수 있습니다. 남은 줄이 3개 이상이어야 합니다.", "네 개짜리 같은 숫자 묶음에서 하나를 떼어 쓸 수 있습니다.", "조커는 아껴 두면 좋지만, 끝까지 들고 있으면 30점짜리 짐이 됩니다.", "컴퓨터도 보통과 어려움에서는 판의 묶음을 풀어 자기 타일을 끼워 넣습니다. 쉬움에서는 자기 타일로 만든 묶음만 냅니다.")),
  help: "마우스·터치: 타일을 눌러 고르고, 판의 버튼이나 금색 칸을 누릅니다",
  sides: ["나", "컴퓨터"],
  startWord: "바닥에 앉기",
};
