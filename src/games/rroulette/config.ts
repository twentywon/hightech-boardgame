import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CHAMBERS, PULL, SPIN, SPINS, pullMove, rRoulette, spinMove, still, type State } from "./rules";
import { RR_COLORS, RRouletteView } from "./view";
import { rRouletteNet } from "./net";

/** Whether it is my turn to pull. */
const mine = (s: State) => s.winner === null && s.seat === 0;

export const rRouletteConfig: PointConfig<State> = {
  game: rRoulette,
  view: (host, quality) => new RRouletteView(host, quality),
  colors: RR_COLORS,
  // The toy's sounds: the cylinder's ratchet as it spins, the hammer cocked, a heartbeat as the trigger comes back,
  // then the hammer falling on an empty chamber (철컥, the user asked), or the 펑 of a party popper; cheering for
  // whoever is left.
  knock: (sound, kind, strength) => {
    if (kind === "disc") sound.clack(Math.min(0.7, strength));
    else if (kind === "cushion") (strength < 0.5 ? sound.clasp(0.6) : sound.thud());
    else if (strength < 0.5) sound.hammerFall();
    else if (strength < 0.9) {
      sound.pop();
      sound.sparkle();
    } else sound.applause(0.8, 0.1);
  },
  // Spinning or pulling cannot be taken back, and every other seat is the computer's.
  computerOnly: true,
  noUndo: true,
  noPanel: true,
  showMovable: false,
  // Over Wi-Fi two to four devices pass the toy round the table (`net.ts`).
  net: rRouletteNet,
  // The computer holds the toy a moment before it chooses, so that the turn can be felt.
  ponder: () => 650,
  keyPoints: () => [
    { x: -1, z: 0 },
    { x: 1, z: 0 },
  ],
  keyStart: () => PULL,
  keyMove: (key, s) => {
    if (!mine(s)) return null;
    if (key === "s" || key === "S" || key === "ㄴ") return s.spins[0] > 0 ? spinMove : null;
    if (key === " " || key === "Enter") return pullMove;
    return null;
  },
  // No words tell each pull (the user asked): the toy and the faces do, and a 펑 flings its holder off the chair;
  // only the game's end is said (the finale).
  settings: [
    {
      id: "rivals",
      kind: "choice",
      label: "상대",
      value: "3",
      net: false,
      options: [
        { value: "1", label: "컴퓨터 1명" },
        { value: "2", label: "컴퓨터 2명" },
        { value: "3", label: "컴퓨터 3명" },
      ],
    },
    { id: "spins", kind: "number", label: "한 사람이 원통을 돌릴 수 있는 횟수", value: SPINS, min: 0, max: 5 },
  ],
  firstNote: "내가 먼저 장난감을 듭니다. 와이파이 여럿이에서는 1번(방장)부터 돌아갑니다.",
  tools: [
    { label: "원통 돌리기", point: SPIN, show: (s) => mine(s) && s.spins[0] > 0, text: (s) => `원통 돌리기 (${s.spins[0]})` },
    { label: "그냥 당기기", point: PULL, show: (s) => mine(s) },
  ],
  tallyHtml: (s) => [`<span>돌리기 ${s.spins[0]}번</span>`, `<span>남은 사람 ${still(s).length}</span>`],
  name: "러시안 룰렛",
  english: "Russian Roulette",
  number: "NO. 114 — DON'T GO POP",
  intro: `<p>장난감 리볼버를 돌려 가며 방아쇠를 당기는 파티 게임.<br>여섯 칸 중 한 칸에만 "펑!" 딱총이 들어 있습니다. 펑이 터지면 의자에서 날아가 탈락, 끝까지 남은 사람이 이깁니다.</p>`,
  meta: `2~4명 · ${CHAMBERS}칸 중 1칸 · 원통 돌리기 ${SPINS}번`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>DON'T GO POP</span>`,
  artClass: "indian-art",
  artLabel: "러시안 룰렛 미리보기",
  tableLabel: "GAME NIGHT",
  tableNote: (_variant, options) => `${Math.min(3, Math.max(1, Number(options.rivals ?? 3))) + 1}명 · 돌리기 ${Number(options.spins ?? SPINS)}번`,
  rulesTitle: "펑을 피해 끝까지 남으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `장난감 리볼버의 원통에는 칸이 ${CHAMBERS}개 있고, 그중 <b>한 칸에만</b> "펑!" 딱총이 들어 있습니다. 어느 칸인지는 아무도 모릅니다.`,
        "나 → 왼쪽 → 맞은편 → 오른쪽 차례로 장난감을 넘겨 가며, 자기 차례에 장난감을 머리에 대고 방아쇠를 한 번 당깁니다.",
        "<b>철컥</b>이면 무사합니다. 원통이 한 칸 돌아가고 다음 사람에게 넘어갑니다.",
        "<b>펑!</b>이면 색종이가 터지며 의자에서 날아가 바닥에 뻗고 탈락합니다. 새 딱총을 넣고 원통을 돌려 다음 사람부터 이어 갑니다.",
        "마지막까지 남은 한 사람이 이깁니다.",
      ),
    ) +
    part(
      "원통 돌리기",
      table(
        ["그냥 당기기", "원통을 그대로 두고 당깁니다. 찰칵이 이어질수록 남은 칸이 줄어 펑 확률이 커집니다(6칸 → 1/6, 2칸 남으면 1/2, 마지막 1칸은 반드시 펑)."],
        ["원통 돌리기", `당기기 전에 원통을 휙 돌려 칸을 다시 섞습니다. 펑 확률이 1/${CHAMBERS}로 돌아갑니다. 한 사람이 한 판에 정해진 횟수(기본 ${SPINS}번)만 돌릴 수 있습니다.`],
        ["가운데 카드", "탁자 가운데 카드에 돌리고 나서 쏜 칸이 ✓로 표시되고, 지금 펑 확률(1/남은 칸)이 쓰여 있습니다."],
      ),
    ) +
    part(
      "조작",
      table(
        ["당기기", "내 앞의 장난감을 <b>길게 누르고 있으면</b> 방아쇠가 천천히 당겨지다가 끝까지 들어가면 당겨집니다(중간에 떼면 취소). <b>그냥 당기기</b> 버튼을 눌러도 됩니다."],
        ["돌리기", "<b>원통 돌리기</b> 버튼을 누르면 원통을 돌린 뒤 바로 당깁니다."],
        ["키보드", "스페이스·Enter는 그냥 당기기, S는 원통 돌리기입니다."],
      ),
    ) +
    part("처음이라면", notes("돌리기는 펑 확률이 1/2이나 1/3처럼 커졌을 때를 위해 아껴 두세요.", "사람이 적을수록 장난감이 빨리 돌아옵니다. 남은 돌리기 횟수를 잘 셈해 보세요.", "진짜 총이 아니라 색종이가 터지는 파티용 장난감입니다.")),
  help: "마우스·터치: 내 앞의 장난감을 길게 눌러 당기거나, 아래 버튼(원통 돌리기·그냥 당기기)<br>키보드: 스페이스·Enter 당기기, S 돌리기",
  sides: ["나", "컴퓨터"],
  startWord: "파티 시작",
};
