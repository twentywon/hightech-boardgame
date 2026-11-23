import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DISTANCE, FORMATS, LEVELS, SET_ARROWS, WIN, archery, formatOf, type State } from "./rules";
import { ARCHERY_COLORS, ArcheryView } from "./view";
import { setResult } from "./result";

export const archeryConfig: PointConfig<State> = {
  game: archery,
  // 와이파이 여럿이: each device shoots its own side; the host's state after each shot goes with it (`settled`).
  // A room is for two: the variant played alone is played as the one for two.
  net: { settled: true, variant: () => "match" },
  // The scoreboard on the field, the inset and the score bug over the table tell everything; the panel stays for readers.
  noPanel: true,
  // An arrow shot cannot be taken back.
  noUndo: true,
  // The value is called once the arrow has struck.
  cheerOnRest: true,
  soloOf: (variant) => formatOf(variant) !== "match",
  view: (host, quality, _variant, mode) => new ArcheryView(host, quality, mode),
  colors: ARCHERY_COLORS,
  variants: FORMATS.map((f) => ({ value: f.value, label: f.label })),
  variantLabel: "경기",
  // The computer takes its stance and settles before it lets go.
  ponder: () => 900,
  cheer: (before, state) => {
    const arrow = state.last;
    if (!arrow || state.ply !== before.ply + 1) return null;
    return arrow.label === "M" ? "미스" : arrow.label === "X" || arrow.value >= 9 ? `${arrow.label}!` : arrow.label;
  },
  // A set of the match is told over the table once its last arrow has struck (after that arrow's value).
  setResult: (before, state, mode) => setResult(before, state, mode, ["빨강", "파랑"]),
  // The string's thrum as the bow is let go; a dull thud in the straw, the crowd clapping a 10; the grass for a miss past the boss.
  knock: (sound, kind, strength) => {
    if (kind === "cushion") return sound.bow();
    if (kind === "pocket") return sound.soft(2);
    sound.thud();
    if (strength >= 1) sound.applause(0.9);
    else if (strength >= 0.9) sound.applause(0.4);
  },
  contact: () => {},
  movingText: "화살이 날아가는 중…",
  name: "양궁",
  english: "Archery",
  number: "NO. 84 — SEVENTY METRES",
  intro: `<p>잔디 사로에 서서 ${DISTANCE}m 앞 과녁을 겨눕니다.<br>누르고 있는 동안 활을 당기고, 흔들리는 조준점을 바람만큼 비켜 맞춘 뒤 손을 떼세요. 올림픽처럼 세트제로 겨루거나 혼자 점수를 쌓습니다.</p>`,
  meta: `1–2인 · ${DISTANCE}m 리커브 · 세트당 화살 ${SET_ARROWS}발 · ${WIN}세트점 선승`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SEVENTY METRES</span>`,
  artClass: "hexa-art",
  artLabel: "양궁 미리보기",
  tableLabel: "THE RANGE",
  tableNote: (variant) => (formatOf(variant) === "match" ? `세트제 · ${WIN}세트점 선승` : formatOf(variant) === "12" ? "혼자 12발 · 6발씩 2엔드" : "혼자 36발 · 6발씩 6엔드"),
  rulesTitle: `${DISTANCE}m 앞 과녁을 겨누세요`,
  rules:
    part(
      "기본 규칙",
      steps(
        `${DISTANCE}m 앞의 지름 122cm 과녁에 화살을 쏩니다. 가운데 노랑부터 빨강, 파랑, 검정, 하양까지 링마다 <b>10점에서 1점</b>입니다.`,
        "화면을 <b>누르고 있으면</b> 활을 당기며 과녁이 가까이 보이고, 조준기의 초록 점(조준점)이 올라옵니다. 누른 채 끌면 조준점이 따라 움직이고, <b>손을 떼면</b> 화살이 날아갑니다. 다 당기기 전에 떼면 쏘지 않고 활을 내립니다.",
        "조준점은 손이 떨리듯 조금씩 흔들립니다. 몇 초가 지나도록 당기고 있으면 팔이 지쳐 점점 더 크게 흔들립니다.",
        "조준점은 <b>바람이 없을 때</b> 화살이 꽂힐 자리입니다. 화살은 날아가는 동안 바람에 밀리므로 바람이 부는 반대쪽으로 비켜 겨눠야 합니다.",
        "바람은 화살마다 조금씩 바뀝니다. 오른쪽 아래의 화살표와 m/s, 양옆의 풍향 자루와 과녁 위 깃발이 이번 화살이 받을 바람을 보여 줍니다.",
      ),
    ) +
    part(
      "점수",
      table(
        ["X", "10점 안의 작은 원. 10점으로 세고, 혼자 쏠 때는 따로 셉니다."],
        ["선에 걸친 화살", "화살이 두 링 사이의 선에 닿으면 <b>높은 점수</b>로 셉니다."],
        ["M (미스)", "과녁 밖에 꽂히거나 과녁을 벗어난 화살. 0점입니다."],
      ),
    ) +
    part(
      "세트제 대결",
      table(
        ["세트", `한 세트에 한 사람이 <b>${SET_ARROWS}발</b>씩, 한 발씩 번갈아 쏩니다. 합계가 높은 쪽이 <b>세트점 2점</b>, 같으면 1점씩 나눕니다.`],
        ["승리", `세트점 <b>${WIN}점</b>을 먼저 얻는 쪽이 이깁니다. 다음 세트는 세트점이 뒤진 쪽이 먼저 쏘고, 같으면 처음 시작한 쪽이 먼저 쏩니다.`],
        ["슛오프", "5 대 5가 되면 한 발씩 더 쏴서 <b>과녁 한가운데에 더 가까운</b> 화살이 이깁니다. 거리까지 똑같으면 다시 한 발씩 쏩니다."],
        ["컴퓨터", `바람을 읽어 비켜 겨누고 쏩니다. 난이도가 높을수록 덜 흩어지고 바람을 더 정확히 읽습니다(${Object.values(LEVELS)
          .map((l) => l.label)
          .join(" · ")}).`],
      ),
    ) +
    part(
      "혼자 쏘기",
      table(
        ["12발", "한 엔드에 6발씩 2엔드. 최고 120점입니다."],
        ["36발", "한 엔드에 6발씩 6엔드. 최고 360점입니다."],
      ),
    ) +
    part(
      "바람",
      table(
        ["옆바람", "1 m/s마다 화살이 바람 부는 쪽으로 <b>약 8cm</b>, 링 하나 남짓 밀립니다. 3 m/s면 반대쪽으로 링 네 개쯤 비켜 겨눕니다."],
        ["뒷바람·맞바람", "과녁 쪽으로 부는 뒷바람은 화살을 조금 띄우고, 사수 쪽으로 부는 맞바람은 조금 떨어뜨립니다. 3 m/s에 약 6cm입니다."],
        ["바람 화살표", "위쪽이 과녁입니다. 화살표가 가리키는 쪽으로 바람이 붑니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "누르자마자 조준점은 한가운데에서 시작합니다. 바람 화살표를 보고 반대쪽으로 끌어 비켜 겨눈 뒤 떼세요.",
        "흔들리는 조준점이 겨눈 곳을 지나가는 순간 손을 떼면 좋습니다. 너무 오래 끌면 팔이 지쳐 흔들림이 커집니다.",
        "쏜 뒤 오른쪽 위에 과녁을 가까이 비춘 화면이 나옵니다. 화살이 바람에 얼마나 밀렸는지 보고 다음 화살을 고쳐 겨누세요.",
      ),
    ),
  help: "마우스·터치: 누르고 있으면 활을 당기고, 끌어서 겨눈 뒤 떼면 쏩니다<br>키보드: 스페이스나 Enter를 누르고 있는 동안 당기며 방향키로 겨누고, 떼면 쏩니다",
  sides: ["빨강", "파랑"],
  firstNote: "컴퓨터 대전에서는 내가 빨강 화살로 먼저 쏩니다.",
  startWord: "사로에 서기",
};
