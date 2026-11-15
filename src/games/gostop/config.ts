import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { GO, GOAL, STOP, gostop, monthOf, type State } from "./rules";
import { GOSTOP_COLORS, GostopView } from "./view";

/** Where the keyboard walks: the cards that can be chosen now, my hand in a row and the floor's two choices above it. */
function keyPoints(state: State) {
  const points = Array.from({ length: 48 }, () => ({ x: NaN, z: NaN }));
  if (state.turn !== 0 || state.winner !== null) return points;
  if (state.phase === "play") [...state.hands[0]].sort((a, b) => a - b).forEach((id, i) => (points[id] = { x: i, z: 1 }));
  if (state.phase === "choose") state.floor.filter((id) => monthOf(id) === monthOf(state.pending!)).forEach((id, i) => (points[id] = { x: i, z: 0 }));
  return points;
}
const first = (state: State) => {
  const points = keyPoints(state),
    id = points.findIndex((p) => !Number.isNaN(p.x));
  return id < 0 ? 0 : id;
};
export const gostopConfig: PointConfig<State> = {
  game: gostop,
  contact: (sound) => sound.card(),
  view: (host, quality) => new GostopView(host, quality),
  colors: GOSTOP_COLORS,
  keyPoints,
  keyStart: first,
  rehome: (before, next) => before.phase !== next.phase || before.turn !== next.turn,
  // Each sees only their own hand: one screen cannot serve two, and a card turned over cannot be taken back.
  computerOnly: true,
  // No panel beside the table (the user asked): the scores are painted on tablets by the pile.
  noPanel: true,
  noUndo: true,
  showMovable: false,
  ponder: () => 500,
  // 쪽, 뻑, 따닥 and the rest are called out over the table, as players do.
  cheer: (before, state) => {
    if (state.phase === "decide" && before.phase !== "decide") return null;
    const said = state.last && state.last !== before.last ? state.last.events : [];
    return said.length ? said.join(" ") + "!" : null;
  },
  tools: [
    { label: "고", point: GO, show: (state) => state.phase === "decide" && state.turn === 0 },
    { label: "스톱", point: STOP, show: (state) => state.phase === "decide" && state.turn === 0 },
  ],
  name: "고스톱",
  english: "Go-Stop",
  number: "NO. 52 — FLOWERS ON THE BLANKET",
  intro: `<p>담요 위에 펼쳐지는 열두 달의 꽃.<br>같은 달의 패를 맞춰 가져오고, 점수가 나면 <b>고</b>를 외쳐 더 가거나 <b>스톱</b>으로 끝냅니다. 컴퓨터와 둘이 치는 맞고입니다.</p>`,
  meta: `나 대 컴퓨터 · 화투 48장 · ${GOAL}점부터 고/스톱`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>MATCH THE MONTHS</span>`,
  artClass: "indian-art",
  artLabel: "고스톱 미리보기",
  tableLabel: "ON THE BLANKET",
  tableNote: () => `맞고 · ${GOAL}점 스톱`,
  rulesTitle: "같은 달끼리 맞춰 먹습니다",
  rules:
    part(
      "기본 규칙",
      steps(
        "화투는 열두 달, 달마다 네 장씩 48장입니다. 나와 컴퓨터가 10장씩 받고, 바닥에 8장을 펼치고, 나머지는 더미로 엎어 둡니다.",
        "내 차례에는 손의 패를 한 장 냅니다. 바닥에 <b>같은 달</b>의 패가 있으면 둘을 가져오고, 없으면 바닥에 내려놓습니다.",
        "이어서 더미의 맨 위 패를 뒤집습니다. 뒤집은 패도 바닥에 같은 달이 있으면 가져옵니다.",
        `가져온 패로 점수를 냅니다. <b>${GOAL}점</b>이 넘으면 <b>고</b>(계속해서 점수를 더 냄)나 <b>스톱</b>(그 자리에서 이김)을 고릅니다.`,
        "둘 다 손패를 다 낼 때까지 아무도 나지 못하면 <b>나가리</b>, 무승부입니다.",
      ),
    ) +
    part(
      "점수",
      table(
        ["광", "3장 3점(비광이 끼면 2점), 4장 4점, 5장 15점"],
        ["열끗", "5장 1점, 한 장마다 1점 더. 2·4·8월 새 세 장은 <b>고도리</b> 5점"],
        ["띠", "5장 1점, 한 장마다 1점 더. 1·2·3월 붉은 띠 <b>홍단</b>, 6·9·10월 파란 띠 <b>청단</b>, 4·5·7월 풀 띠 <b>초단</b> 각 3점"],
        ["피", "10장 1점, 한 장마다 1점 더. 11·12월의 쌍피는 두 장으로 셉니다"],
      ),
    ) +
    part(
      "특별한 경우",
      table(
        ["쪽", "바닥에 맞는 패가 없어 내려놓았는데 뒤집은 패가 그 짝이면 둘을 가져오고, 상대 피를 한 장 뺏습니다."],
        ["뻑", "낸 패로 한 장을 맞췄는데 뒤집은 패도 같은 달이면 세 장이 바닥에 붙어 남습니다. 나중에 네 번째 패로 가져가면 상대 피를 한 장 뺏습니다. 내 뻑이 세 번이면 그대로 이깁니다."],
        ["따닥", "바닥의 같은 달 두 장에 내고, 뒤집은 패도 같은 달이면 네 장을 모두 가져오고 피를 한 장 뺏습니다."],
        ["싹쓸이", "바닥의 패를 모두 쓸어 가면 피를 한 장 뺏습니다."],
        ["두 장 중 고르기", "같은 달 두 장이 바닥에 있고 종류가 다르면 가져올 패를 누릅니다."],
        ["고", "한 번 할 때마다 1점을 더하고, 3고부터는 점수가 두 배씩 됩니다. 고를 하면 점수가 더 나야 다시 고/스톱을 고를 수 있습니다."],
        ["박", "이긴 쪽이 피로 점수를 냈는데 진 쪽 피가 5장 이하면 <b>피박</b>, 광으로 냈는데 진 쪽 광이 없으면 <b>광박</b>, 열끗이 7장 이상이면 <b>멍박</b>, 고를 하고 진 쪽은 <b>고박</b>. 각각 두 배입니다."],
      ),
    ) +
    part("처음이라면", notes("광과 쌍피는 보이는 대로 가져옵니다.", "상대가 모으는 띠나 고도리의 마지막 한 장은 먼저 가져와 막습니다.", "점수가 적게 앞설 때 무리한 고는 고박으로 돌아올 수 있습니다.")),
  help: "마우스·터치: 낼 패를 누릅니다. 고·스톱은 판 위의 버튼으로<br>키보드: 방향키로 패를 고르고 Enter",
  sides: ["나", "컴퓨터"],
  startWord: "담요 앞에 앉기",
};
