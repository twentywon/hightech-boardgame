import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BAR, OFF, ROLL, backgammon, type State } from "./rules";
import { BG_COLORS, BackgammonView, DICE_AT, spotOf } from "./view";

export const backgammonConfig: PointConfig<State> = {
  game: backgammon,
  contact: (sound) => sound.wood(3),
  noPanel: true,
  view: (host, quality) => new BackgammonView(host, quality),
  // Over one Wi-Fi each device plays one side; the dice are thrown by the side to move and fall as the host draws them
  // when it takes the throw (`src/net/random.ts`). There is no doubling cube to offer.
  net: {},
  colors: BG_COLORS,
  keyPoints: (s) => [...Array.from({ length: 24 }, (_, p) => spotOf(p, 0)), spotOf(BAR, s.turn), spotOf(OFF, s.turn), DICE_AT],
  cheer: (before, state, mode) => (state.last && state.last !== before.last && state.last.hit ? (mode === "ai" && state.last.side === 1 ? "잡혔다!" : "잡았다!") : null),
  // A roll cannot be taken back.
  noUndo: true,
  // The dice themselves are tapped: the button is kept for the keyboard only.
  tools: [{ label: "주사위 굴리기", point: ROLL, onBoard: true }],
  name: "백개먼",
  english: "Backgammon",
  number: "NO. 60 — FIVE THOUSAND YEARS OF DICE",
  intro: `<p>주사위 두 개로 말 열다섯 개를 집으로 몰아 내보내는 오래된 놀이.<br>혼자 선 말은 잡히고, 두 개 이상 모인 칸은 막힙니다.</p>`,
  meta: "2인 · 말 15개씩 · 주사위 2개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>RACE AND HIT</span>`,
  artClass: "ludo-art",
  artLabel: "백개먼 판 미리보기",
  tableLabel: "THE BACKGAMMON CASE",
  tableNote: () => "말 15개씩 · 흰색 선공",
  rulesTitle: "먼저 열다섯 개를 내보내기",
  rules:
    part(
      "기본 규칙",
      steps(
        "판에는 뾰족한 칸(포인트)이 24개 있습니다. 흰 말(나)은 시계 반대 방향으로 돌아 <b>오른쪽 아래 여섯 칸</b>(내 집)으로 모읍니다.",
        "주사위 두 개를 굴려 나온 두 수만큼 말을 옮깁니다. 한 말을 두 번 옮겨도 되고 두 말을 하나씩 옮겨도 됩니다. <b>같은 수가 나오면 네 번</b> 옮깁니다.",
        "말 열다섯 개가 모두 집에 들어오면 판 밖으로 <b>내보낼</b> 수 있습니다. 먼저 모두 내보내면 이깁니다.",
      ),
    ) +
    part(
      "칸과 잡기",
      table(
        ["막힌 칸", "상대 말이 두 개 이상 있는 칸에는 설 수 없습니다."],
        ["잡기", "상대 말이 <b>하나만</b> 있는 칸에 서면 그 말은 가운데 <b>바</b>로 갑니다."],
        ["바", "바에 말이 있으면 그 말부터 상대의 집으로 다시 들여보내야 다른 말을 움직일 수 있습니다."],
        ["주사위 쓰기", "쓸 수 있는 만큼 주사위를 모두 써야 합니다. 하나만 쓸 수 있으면 큰 수를 씁니다."],
        ["내보내기", "남은 칸과 같은 수로 내보냅니다. 그보다 큰 수는 더 먼 칸에 말이 없을 때 씁니다."],
      ),
    ) +
    part("승부", table(["이기기", "1배"], ["개먼", "진 쪽이 한 개도 못 내보냈으면 2배"], ["백개먼", "그런데 진 쪽 말이 바나 이긴 쪽 집에 남아 있으면 3배"])) +
    part("처음이라면", notes("혼자 선 말(블롯)은 상대 말 1~12칸 앞에 두지 않는 것이 좋습니다.", "내 집에 막힌 칸을 많이 만들수록 잡힌 상대 말이 돌아오기 어렵습니다.", "말이 앞서면 부딪치지 않게 빨리 달리고, 뒤지면 칸을 지키며 잡을 기회를 기다립니다.")),
  help: "마우스·터치: 주사위를 누르고, 금색 고리가 뜬 말과 갈 칸을 차례로 누릅니다",
  sides: ["흰색", "빨간색"],
  startWord: "판 앞에 앉기",
};
