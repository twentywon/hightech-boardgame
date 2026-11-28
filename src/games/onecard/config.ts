import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BUST, DRAW, HAND, SUIT_BASE, oneCard, type State } from "./rules";
import { ONECARD_COLORS, OneCardView, sorted } from "./view";
import { handX, ONECARD } from "./layout";
import { SUIT_GLYPH, SUIT_NAME } from "../deck/cards";
import { oneCardNet } from "./net";

export const oneCardConfig: PointConfig<State> = {
  game: oneCard,
  contact: (sound) => sound.card(),
  noPanel: true,
  // Over Wi-Fi the cards out of my sight are blind ones (`net.ts`).
  view: (host, quality, _variant, _mode, _level, net) => new OneCardView(host, quality, net),
  colors: ONECARD_COLORS,
  keyPoints: (s) => {
    const points = Array.from({ length: DRAW + 1 }, () => ({ x: NaN, z: NaN }));
    sorted(s.hands[0]).forEach((id, i) => (points[id] = { x: handX(i, s.hands[0].length), z: ONECARD.HAND_Z }));
    points[DRAW] = { x: ONECARD.PILE.x, z: ONECARD.PILE.z };
    return points;
  },
  // The keyboard starts on the first card of my hand.
  keyStart: (s) => sorted(s.hands[0])[0] ?? DRAW,
  rehome: (before, next) => before.seat !== next.seat || before.ply !== next.ply,
  // Each side sees only its own hand, and a card drawn cannot be put back.
  computerOnly: true,
  noUndo: true,
  // Over Wi-Fi each device holds its own hand, two to four round the bed (`net.ts`).
  net: oneCardNet,
  showMovable: false,
  ponder: (s) => (s.phase === "play" ? 350 : 200),
  cheer: (before, state) => {
    const said = state.last && state.last !== before.last ? state.last.events : [];
    return said.length ? said.join(" ") : null;
  },
  tools: [
    ...[0, 1, 2, 3].map((i) => ({ label: `${SUIT_GLYPH[i]} ${SUIT_NAME[i]}`, point: SUIT_BASE + i })),
    // The pile itself is tapped to draw: the button is kept for the keyboard only.
    { label: "한 장 받기", point: DRAW, onBoard: true },
  ],
  name: "원카드",
  english: "One Card",
  number: "NO. 61 — ONE CARD LEFT",
  intro: `<p>무늬나 숫자를 맞춰 카드를 내고, 공격 카드로 다음 사람에게 카드를 떠넘기는 한국식 카드놀이.<br>침대 위에서 컴퓨터 셋과 넷이서, 먼저 손의 카드를 모두 내면 이깁니다.</p>`,
  meta: `나 대 컴퓨터 셋 · 카드 54장(조커 2장) · ${HAND}장씩`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>MATCH THE SUIT OR THE RANK</span>`,
  artClass: "indian-art",
  artLabel: "원카드 미리보기",
  tableLabel: "ON THE BED",
  tableNote: () => `넷이서 · ${HAND}장씩 · 내가 먼저`,
  rulesTitle: "먼저 손을 비우세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `나(남쪽)와 컴퓨터 셋(서쪽·북쪽·동쪽)이 카드 54장(조커 2장 포함)을 섞어 ${HAND}장씩 나눠 갖고, 한 장을 펼쳐 놓습니다. 나 → 왼쪽 → 맞은편 → 오른쪽 차례로 돌아갑니다.`,
        "내 차례에는 맨 위 카드와 <b>무늬나 숫자가 같은</b> 카드 한 장을 냅니다. 낼 수 없거나 내지 않으려면 더미에서 <b>한 장</b>을 받습니다.",
        "손의 카드를 가장 먼저 모두 낸 사람이 이깁니다. 한 장이 남으면 <b>원카드!</b>를 외칩니다.",
        `내 카드가 <b>${BUST}장</b>이 되면 파산으로 집니다. 컴퓨터가 파산하면 그 컴퓨터만 빠지고, 셋 모두 파산하면 내가 이깁니다.`,
      ),
    ) +
    part(
      "특수 카드",
      table(
        ["2", "공격: 다음 사람이 2장을 받습니다."],
        ["A", "공격: 3장. 스페이드 A는 5장입니다."],
        ["조커", "공격: 흑백 조커 5장, 컬러 조커 7장. 어느 카드 위에나 낼 수 있습니다."],
        ["공격 막기", "공격받으면 맨 위 카드와 무늬나 숫자가 같은 공격 카드, 더 센 공격 카드, 또는 조커를 내어 공격을 넘깁니다. 받는 장수는 쌓입니다. 막지 못하면 쌓인 만큼 받습니다."],
        ["7", "다음에 낼 무늬를 바꿉니다."],
        ["J", "점프: 다음 사람을 건너뜁니다."],
        ["Q", "방향 바꾸기: 차례가 도는 방향이 거꾸로 됩니다."],
        ["K", "한 번 더: 낸 사람이 한 장 더 냅니다."],
        ["차례", "지금 낼 사람의 카드 밑이 은은하게 밝아집니다."],
      ),
    ) +
    part("처음이라면", notes("조커는 공격을 막을 때를 위해 아껴 둡니다.", "다음 사람의 카드가 한두 장 남았을 때 공격 카드를 냅니다.", "7로 무늬를 바꿀 때는 내가 많이 가진 무늬를 고릅니다.")),
  help: "마우스·터치: 낼 카드를 누르거나, 더미를 눌러 한 장 받습니다",
  sides: ["나", "컴퓨터"],
  startWord: "테이블에 앉기",
};
