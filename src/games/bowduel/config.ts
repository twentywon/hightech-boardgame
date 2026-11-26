import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HURT, HEALTH, LEVELS, PART_NAMES, SPAN, VARIANTS, WIND_MOST, bowDuel, type State } from "./rules";
import { DUEL_COLOURS, DuelView } from "./view";

export const bowDuelConfig: PointConfig<State> = {
  game: bowDuel,
  // 와이파이 여럿이: each device shoots its own archer (seen on its left); the host's state after each shot goes with it.
  net: { settled: true },
  noPanel: true,
  // An arrow loosed cannot be taken back.
  noUndo: true,
  cheerOnRest: true,
  view: (host, quality, _variant, mode) => new DuelView(host, quality, mode),
  colors: DUEL_COLOURS,
  variants: VARIANTS.map((v) => ({ value: v.value, label: v.label })),
  variantLabel: "들판",
  // The computer takes the string and draws before it looses (the view shows the draw).
  ponder: () => 500,
  cheer: (before, state) => {
    const shot = state.last;
    if (!shot || state.ply !== before.ply + 1) return null;
    if (shot.target === shot.side) return "앗, 제 화살!";
    if (shot.part === "head") return "머리 명중!";
    if (shot.part) return `${PART_NAMES[shot.part]} 명중`;
    return null;
  },
  // The string's thrum as the arrow goes; a thump and a cry in an archer (a head the loudest); the dry earth.
  knock: (sound, kind, strength) => {
    if (kind === "cushion") return sound.bow();
    if (kind === "pocket") return strength > 0 ? sound.soft(2, 0.7) : undefined;
    sound.thud();
    sound.grunt(strength);
    if (strength >= 1) sound.applause(0.35, 0.25);
  },
  contact: () => {},
  movingText: "화살이 날아가는 중…",
  name: "활잡이 결투",
  english: "Archer Duel",
  number: "NO. 116 — DRAW AND LOOSE",
  intro: `<p>억새 언덕 양끝에 선 두 활잡이가 한 발씩 번갈아 쏩니다.<br>끌어서 활을 당기고 놓으면 화살이 날아갑니다. 조준선은 없습니다. 지난 화살이 떨어진 곳을 보고 각도와 힘을 고쳐 먼저 상대를 쓰러뜨리세요.</p>`,
  meta: `1–2인 · 거리 ${SPAN.least}–${SPAN.most}m · 체력 ${HEALTH} · 머리 ${HURT.head} · 몸통 ${HURT.body} · 다리 ${HURT.legs}`,
  art: `<div class="ad-art"><i></i><i></i><b></b></div><span>DRAW AND LOOSE</span>`,
  artClass: "hexa-art",
  artLabel: "활잡이 결투 미리보기",
  tableLabel: "THE HIGHLAND",
  tableNote: (variant) => (variant === "calm" ? "바람 없는 들판" : "바람 부는 들판"),
  rulesTitle: "지난 화살을 보고 다음 화살을 고치세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `두 활잡이가 ${SPAN.least}–${SPAN.most}m 떨어진 두 언덕에 서서 <b>한 발씩 번갈아</b> 쏩니다. 거리와 언덕 높이는 판마다 다릅니다.`,
        "화면 아무 곳이나 누른 채 <b>뒤로 끌면</b> 활을 당깁니다. 화살은 끄는 반대쪽으로 날아갑니다(아래로 끌면 위로 쏩니다). 길게 끌수록 세게 당깁니다. <b>손을 떼면</b> 쏩니다.",
        "조준선은 없습니다. 당기는 동안 <b>각도와 힘</b>(숫자)과 지난 화살의 각도·힘만 보입니다. 화살은 중력에 떨어지며 포물선을 그립니다.",
        "화살이 날아가는 동안 화면이 화살을 따라가고, 떨어진 곳에서 잠시 멈췄다가 다음 사람에게 돌아옵니다. 위쪽 띠 지도에 두 사람의 위치와 <b>각자 지난 화살이 떨어진 곳</b>이 표시됩니다.",
      ),
    ) +
    part(
      "맞힌 곳",
      table(
        ["머리", `체력 <b>${HURT.head}</b>을 깎습니다. 머리 두 발이면 끝납니다.`],
        ["몸통", `체력 <b>${HURT.body}</b>을 깎습니다.`],
        ["다리", `체력 <b>${HURT.legs}</b>을 깎습니다.`],
        ["승리", `상대의 체력 ${HEALTH}을 먼저 0으로 만들면 이깁니다. 너무 높이 쏜 화살이 <b>내게 떨어지면</b> 나도 다칩니다.`],
      ),
    ) +
    part(
      "바람",
      table(
        ["바람 부는 들판", `화살마다 바람이 새로 붑니다(최대 ${WIND_MOST} m/s). 위쪽 가운데 화살표가 바람이 부는 쪽이고, 양쪽 깃발도 바람에 날립니다. 바람 쪽으로 쏘면 더 멀리, 바람을 거슬러 쏘면 덜 갑니다.`],
        ["바람 없는 들판", "바람이 없어 같은 각도와 힘이면 늘 같은 곳에 떨어집니다."],
        ["컴퓨터", `처음에는 빗나가지만 화살이 떨어진 곳을 보고 점점 정확해집니다. 난이도가 높을수록 빨리 맞히고 바람도 잘 읽습니다(${Object.values(LEVELS)
          .map((l) => l.label)
          .join(" · ")}).`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "45도 근처에서 힘만 바꿔 가며 쏘면 고치기 쉽습니다. 짧았으면 조금 더 길게, 길었으면 조금 짧게 끄세요.",
        "높은 언덕에서는 덜 당겨도 멀리 가고, 상대가 높은 언덕에 있으면 더 당겨야 합니다.",
        "키보드: ↑↓로 각도, ←→로 힘을 바꾸고 스페이스나 Enter로 쏩니다(Shift를 누르면 더 잘게).",
      ),
    ),
  help: "마우스·터치: 화면을 누른 채 뒤로 끌어 당기고, 떼면 쏩니다<br>키보드: ↑↓ 각도, ←→ 힘, 스페이스·Enter로 쏘기",
  sides: ["빨강", "파랑"],
  firstNote: "컴퓨터 대전에서는 내가 빨간 활잡이로 먼저 쏩니다.",
  startWord: "언덕에 서기",
};
