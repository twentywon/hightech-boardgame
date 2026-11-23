import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { ICE, MOST, NAMES, RINGS, countOf, createGame, modeOf, nim, reach, ruleText, type State } from "./rules";
import { ICE_COLORS, ParlourView } from "./parlour";
import { NIM_COLORS, NimView } from "./view";

/** The most any game lets be taken at once: one tool a count, each shown only while that take is legal. */
const TOOLS = Array.from({ length: MOST.max }, (_, k) => k + 1);

export const nimConfig: PointConfig<State> = {
  game: nim,
  // The rack and the parlour are views of their own; a tap takes up to the ring or scoop pressed.
  view: (host, quality, variant) => (modeOf(variant) === "ice" ? new ParlourView(host, quality) : new NimView(host, quality)),
  variants: [
    { value: "nim", label: "님" },
    { value: "31", label: "아이스크림 31" },
  ],
  variantLabel: "모드",
  // The numbers can be set (the user asked); 아이스크림 31 has its own, so they are not offered there.
  settings: [
    { id: "rings", kind: "number", label: "고리 수", value: RINGS.value, min: RINGS.min, max: RINGS.max, fixed: ["31"] },
    { id: "most", kind: "number", label: "한 번에 가져갈 수 있는 최대 개수", value: MOST.value, min: MOST.min, max: MOST.max, fixed: ["31"] },
    { id: "misere", kind: "flag", label: "마지막을 가져가면 진다", note: "끄면 마지막 고리를 가져가는 쪽이 이깁니다.", value: true, fixed: ["31"] },
    {
      id: "first",
      kind: "choice",
      label: "먼저 하는 쪽",
      value: "me",
      ai: true,
      options: [
        { value: "me", label: "나" },
        { value: "computer", label: "컴퓨터" },
        { value: "random", label: "무작위" },
      ],
    },
  ],
  firstNote: "컴퓨터 대전에서는 내가 앞자리에 앉습니다.",
  sidesOf: () => NAMES,
  colorsOf: (variant) => (modeOf(variant) === "ice" ? ICE_COLORS : NIM_COLORS),
  // The keyboard walks the things that may be taken, in order from the open end (left and right).
  keyPoints: (state) => Array.from({ length: state.most }, (_, k) => ({ x: k, z: 0 })),
  keyStart: () => 0,
  // Every take is a tool too, for the keyboard and readers; a tap on the table does the same, so they are not shown.
  tools: TOOLS.map((t) => ({ label: `${t}개 가져가기`, point: t - 1, onBoard: true })),
  refusal: (state, move) => {
    const t = countOf(move);
    if (t > state.most) return `한 번에 ${state.most}개까지만 가져갈 수 있습니다.`;
    if (t > reach(state)) return `남은 것은 ${reach(state)}개뿐입니다.`;
    return null;
  },
  // The computer waits a moment before its take, so that it can be seen coming.
  ponder: () => 350,
  // 아이스크림 31 is played aloud: the numbers of each take are called across the table, and whoever eats 31 is named.
  cheer: (before, state, mode) => {
    if (state.mode !== "ice" || !state.last || state.takers.length <= before.takers.length) return null;
    const side = state.last.side;
    if (state.takers.length === ICE.total) return mode === "ai" ? (side === 0 ? "내가 31!" : "컴퓨터가 31!") : `${NAMES[side]}가 31!`;
    const called = Array.from({ length: state.takers.length - before.takers.length }, (_, i) => before.takers.length + 1 + i);
    return `${called.join(", ")}!`;
  },
  // Wooden rings knocking as they slide off and land in a tray; a soft plop for each scoop.
  contact: (sound, state) => (state.mode === "ice" ? sound.soft(2) : sound.wood(4)),
  knock: (sound) => sound.knock(2),
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  name: "님 게임",
  english: "Nim",
  number: "NO. 81 — DON'T TAKE THE LAST",
  intro: `<p>막대에 꽂힌 나무 고리를 번갈아 1개부터 정해진 개수까지 가져갑니다.<br>고리 수와 한 번에 가져갈 수 있는 개수는 직접 정합니다. <b>아이스크림 31</b>은 흔히 '베스킨라빈스 31'로 알려진 놀이로, 31번 아이스크림을 먹는 사람이 집니다.</p>`,
  meta: "2인 · 님 / 아이스크림 31",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>DON'T TAKE THE LAST</span>`,
  artClass: "morris-art",
  artLabel: "님 게임 미리보기",
  tableLabel: "THE COUNTING RACK",
  tableNote: (variant, options) => ruleText(createGame(variant, options, () => 0)),
  rulesTitle: "마지막 하나를 피하세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "막대 하나에 나무 고리가 꽂혀 있습니다. 두 사람이 번갈아 막대의 <b>왼쪽 끝</b>에서 고리를 가져갑니다.",
        "한 번에 <b>1개부터 정해진 최대 개수까지</b> 가져갈 수 있습니다. 건너뛸 수는 없습니다.",
        "<b>마지막을 가져가면 진다</b>가 켜져 있으면 마지막 고리를 가져가는 쪽이 지고, 꺼져 있으면 이깁니다.",
        "가져간 고리는 각자의 쟁반에 다섯 개씩 쌓입니다. 내 쟁반은 앞쪽, 상대의 쟁반은 막대 뒤쪽에 있습니다.",
      ),
    ) +
    part(
      "설정",
      table(
        ["고리 수", `${RINGS.min}~${RINGS.max}개. 처음에는 ${RINGS.value}개입니다. 고리는 다섯 개마다 호두나무와 단풍나무로 색이 바뀌어 한눈에 셀 수 있습니다.`],
        ["최대 개수", `한 번에 가져갈 수 있는 최대 개수로, ${MOST.min}~${MOST.max}개입니다. 처음에는 ${MOST.value}개입니다.`],
        ["마지막을 가져가면 진다", "켜면 마지막 고리를 가져가는 쪽이 집니다(처음 설정). 끄면 마지막 고리를 가져가는 쪽이 이깁니다."],
        ["먼저 하는 쪽", "컴퓨터 대전에서 나, 컴퓨터, 무작위 가운데 고릅니다. 로컬 2인에서는 앞자리가 먼저 합니다."],
        ["컴퓨터 난이도", "쉬움은 아무렇게나, 보통은 대개 바르게, 어려움은 언제나 가장 좋은 수로 가져갑니다."],
      ),
    ) +
    part(
      "아이스크림 31",
      table(
        ["규칙", `아이스크림 ${ICE.total}개가 번호 순서대로 놓여 있습니다. 1번부터 차례로 한 번에 1~${ICE.most}개씩 먹고, <b>31번을 먹는 사람이 집니다</b>.`],
        ["외치기", "가져갈 때마다 먹은 번호를 외칩니다(예: “4, 5, 6!”). 31번을 먹으면 그 사람을 부릅니다."],
        ["그릇", "먹은 아이스크림은 각자의 그릇으로 들어가고, 빈 컵에는 먹은 사람의 색 스티커가 붙습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "마지막에서 거꾸로 생각해 보세요. 마지막을 가져가면 지는 규칙이라면, 상대 차례에 고리가 1개만 남게 하면 이깁니다.",
        "최대 개수가 3개라면, 상대가 몇 개를 가져가든 둘이 합쳐 4개가 되게 맞출 수 있습니다.",
        "아이스크림 31에서는 30번을 내가 먹으면 이깁니다. 그러려면 26번, 22번, … 2번을 먹으면 됩니다.",
      ),
    ),
  help: "마우스·터치: 가져갈 마지막 고리를 누르면 그 고리까지 한 번에 가져갑니다<br>키보드: ←→로 고르고 Enter",
  sides: NAMES,
  startWord: "테이블에 앉기",
};
