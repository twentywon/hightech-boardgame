import { part, steps, notes, table } from "../../ui/guide";
import type { SetResult } from "../../ui/chrome";
import type { PointConfig } from "../../ui/point-game";
import { ARROWS, LEVELS, POINTS, ROUND_CHOICES, outcomeName, roundsOf, tuho, type State } from "./rules";
import { DISTANCE } from "./sim";
import { TUHO_COLORS, TuhoView, WOOD_KNOCK } from "./view";

/** A round of a three-round game over, with the game going on: its word for the person at the screen and the scores. */
function roundResult(before: State, state: State, mode: "local" | "ai"): SetResult | null {
  if (state.rounds < 2 || state.winner !== null || state.history.length <= before.history.length) return null;
  const n = state.history.length,
    [a, b] = state.history[n - 1],
    taker: 0 | 1 | null = a > b ? 0 : b > a ? 1 : null,
    word = taker === null ? `${n}판 무승부` : mode === "local" ? `${n}판 · ${taker ? "청" : "홍"}` : `${n}판 ${taker === 0 ? "승리" : "패배"}`;
  return { outcome: taker === null ? "draw" : mode === "local" || taker === 0 ? "win" : "lose", word, detail: `${a} : ${b} · 합계 ${state.scores[0]} : ${state.scores[1]}` };
}
export const tuhoConfig: PointConfig<State> = {
  game: tuho,
  // The score is written on the wooden board in the court; the panel stays in the page for readers.
  noPanel: true,
  // A throw is a matter of the hand and cannot be taken back.
  noUndo: true,
  // What an arrow came to is called once it has come to rest.
  cheerOnRest: true,
  view: (host, quality, _variant, mode) => new TuhoView(host, quality, mode),
  colors: TUHO_COLORS,
  variants: ROUND_CHOICES,
  variantLabel: "판 수",
  // The computer steadies itself before it throws.
  ponder: () => 700,
  cheer: (before, state) => {
    const arrow = state.last;
    if (!arrow || state.ply !== before.ply + 1) return null;
    if (arrow.points) return `${outcomeName(arrow.outcome)}! +${arrow.points}`;
    return arrow.outcome === "lean" ? "기댄 살" : arrow.rimmed ? "튕겨 나감" : "빗나감";
  },
  setResult: roundResult,
  // Bamboo on bronze clacks; an arrow dropping in rings the pot hollow; bamboo on bamboo knocks like yut sticks;
  // one on the mat falls softly. Each as hard as it was struck (an arrow's knock comes `WOOD_KNOCK` stronger).
  knock: (sound, kind, strength) => {
    if (kind === "disc" && strength >= WOOD_KNOCK) sound.stick(0.1 + 0.3 * Math.min(1, (strength - WOOD_KNOCK) * 2));
    else if (kind === "disc") sound.clack(strength);
    else if (kind === "pocket") sound.hollow(strength);
    else sound.soft(2, 0.12 + 0.45 * Math.min(1, strength * 1.5));
  },
  contact: () => {},
  movingText: "화살이 날아가는 중…",
  name: "투호",
  english: "Tuho",
  number: "NO. 98 — ARROWS INTO THE POT",
  intro: `<p>한옥 마당의 놋쇠 항아리 앞, 줄 뒤에 섭니다.<br>화살을 누른 채 뒤로 당겼다 놓아 항아리 입과 귀에 던져 넣으세요. 두 편이 번갈아 ${ARROWS}개씩 던져 점수가 많은 쪽이 이깁니다.</p>`,
  meta: `2인 · 한 판에 화살 ${ARROWS}개씩 · 입 ${POINTS.mouth}점 · 귀 ${POINTS.ear}점`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>ARROWS INTO THE POT</span>`,
  artClass: "hexa-art",
  artLabel: "투호 미리보기",
  tableLabel: "THE HANOK COURT",
  tableNote: (variant) => (roundsOf(variant) > 1 ? `세 판 · 한 판에 ${ARROWS}개씩` : `한 판 · 화살 ${ARROWS}개씩`),
  rulesTitle: "항아리에 화살을 던져 넣으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `${DISTANCE}m 떨어진 줄 뒤에서 놋쇠 항아리에 화살을 던집니다. 항아리에는 목이 긴 <b>입</b>과 양옆의 작은 대롱인 <b>귀</b>가 있습니다.`,
        `홍과 청 두 편이 한 판에 <b>화살 ${ARROWS}개씩</b> 한 대씩 번갈아 던집니다. 판이 끝나면 화살을 모두 거두고, 다음 판은 다른 편이 먼저 던집니다.`,
        "화면을 누른 채 <b>아래로 당겼다가 놓으면</b> 던집니다. 길게 당길수록 세게, 비스듬히 당기면 그 반대쪽으로 날아갑니다. 위로 밀어 던져도 됩니다.",
        "당기고 있는 동안 화살이 날아갈 길의 앞부분이 점선으로 보입니다. 손이 조금씩 떨리듯 점선도 흔들리고, 화살은 <b>손을 놓는 순간</b>의 길로 날아갑니다.",
        "화살은 높이 떴다가 촉이 무겁고 깃이 바람을 받아 촉부터 떨어집니다. 테두리에 맞으면 그 자리에서 꺾여 안으로 미끄러져 들어가거나 밖으로 튕겨 나갑니다.",
        "판을 모두 마쳐 합계가 많은 쪽이 이깁니다. 같으면 무승부입니다.",
      ),
    ) +
    part(
      "점수",
      table(
        ["입 (호)", `항아리 입에 꽂혀 서면 <b>${POINTS.mouth}점</b>입니다.`],
        ["귀 (관이)", `양옆 귀에 꽂혀 서면 <b>${POINTS.ear}점</b>입니다. 입보다 훨씬 좁습니다.`],
        ["기댄 살", "너무 비스듬히 들어가 테두리에 기대어 걸친 화살은 점수가 없습니다."],
        ["빗나감", "테두리나 항아리에 맞고 튕겨 나가거나 땅에 떨어진 화살은 점수가 없습니다."],
        ["판정", "화살이 멈춘 자리로 정합니다. 날아가다 들어갔어도 튕겨 나오면 빗나감입니다."],
      ),
    ) +
    part(
      "판",
      table(
        ["한 판", `서로 ${ARROWS}개씩, 모두 ${ARROWS * 2}대를 던져 끝냅니다.`],
        ["세 판", "세 판을 이어서 던지고 세 판 합계로 겨룹니다. 판마다 들어간 화살과 떨어진 화살을 거둡니다."],
        ["꽂힌 화살", "판이 끝날 때까지 그 자리에 그대로 있습니다. 뒤에 던진 화살이 부딪혀 튕기거나, 그 위에 걸쳐 기댄 살이 되기도 합니다."],
        ["컴퓨터", `던질 길을 미리 여러 번 따져 본 뒤 던지지만 손이 흔들립니다. 난이도가 높을수록 덜 흩어집니다(${Object.values(LEVELS)
          .map((l) => l.label)
          .join(" · ")}).`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "화면 높이의 3분의 1쯤 곧게 아래로 당겼다 놓으면 입 언저리에 떨어집니다. 짧으면 조금 더, 넘어가면 조금 덜 당기세요.",
        "왼쪽 귀를 노리려면 오른쪽 아래로, 오른쪽 귀는 왼쪽 아래로 조금 비스듬히 당깁니다.",
        "점선이 흔들리다 가운데로 돌아오는 순간 놓으면 좋습니다.",
      ),
    ),
  help: "마우스·터치: 누른 채 아래로 당겼다 놓아 던집니다(위로 밀어도 됩니다)<br>키보드: ←→로 방향, ↑↓로 세기를 고르고 Enter나 스페이스로 던집니다",
  sides: ["홍", "청"],
  firstNote: "컴퓨터 대전에서는 내가 홍(빨강 깃) 화살로 먼저 던집니다.",
  startWord: "줄 앞에 서기",
};
