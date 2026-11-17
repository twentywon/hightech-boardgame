import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DARTS, LEVELS, LIMIT, MODES, ROUNDS, START, darts, modeOf, type State } from "./rules";
import { DART_COLORS, DartsView } from "./view";

export const dartsConfig: PointConfig<State> = {
  game: darts,
  // Steel into sisal: a short, dull thud.
  contact: (sound) => sound.soft(4),
  // Something thrown cannot be taken back.
  noUndo: true,
  view: (host, quality, _variant, mode) => new DartsView(host, quality, mode),
  colors: DART_COLORS,
  variants: MODES.map((m) => ({ value: m.value, label: m.label })),
  variantLabel: "경기",
  ponder: () => 250,
  name: "다트",
  english: "Darts",
  number: "NO. 77 — THREE IN THE BOARD",
  intro: `<p>펍 벽에 걸린 다트판 앞, 던지는 선에 섭니다.<br>화면을 위로 밀어 다트를 던지세요. 501은 남은 점수를 정확히 0으로, 카운트업은 ${ROUNDS}라운드 동안 더 많이 넣으면 이깁니다.</p>`,
  meta: `2인 · 한 차례 다트 ${DARTS}개 · 501 더블 아웃 · 카운트업 ${ROUNDS}라운드`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>THREE IN THE BOARD</span>`,
  artClass: "hexa-art",
  artLabel: "다트 미리보기",
  tableLabel: "THE PUB WALL",
  tableNote: (variant) => (modeOf(variant) === "501" ? "501 · 더블 아웃" : `카운트업 · ${ROUNDS}라운드`),
  rulesTitle: "다트판을 노려 던지세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "두 사람이 번갈아 한 차례에 <b>다트 세 개</b>를 던집니다. 세 개를 다 던지면 다트를 뽑고 차례가 넘어갑니다.",
        "<b>화면을 누른 채 위로 밀었다가 놓으면</b> 던집니다. 길게 밀수록 위로, 비스듬히 밀수록 그쪽으로 갑니다. 미는 동안 노리는 곳에 흰 고리가 보입니다.",
        "손이 조금씩 떨리듯 다트는 노린 곳 둘레로 흩어집니다. 흰 고리 안에 꽂히는 일이 많습니다.",
        "판에 꽂힌 자리의 점수를 얻습니다. 판 밖에 꽂히면 0점입니다.",
      ),
    ) +
    part(
      "점수판",
      table(
        ["숫자 칸", "1부터 20까지 스무 칸이 위쪽 20부터 시계 방향으로 놓여 있습니다. 넓은 칸은 그 숫자만큼."],
        ["트리플", "가운데쯤의 좁은 고리. 숫자의 <b>세 배</b>입니다(T20이면 60)."],
        ["더블", "가장 바깥의 좁은 고리. 숫자의 <b>두 배</b>입니다(D16이면 32)."],
        ["불", "한가운데 빨간 점은 <b>50점</b>(더블로 칩니다), 둘레의 초록 고리는 <b>25점</b>."],
      ),
    ) +
    part(
      "경기",
      table(
        ["501", `둘 다 ${START}점에서 시작해 던진 점수만큼 뺍니다. 남은 점수를 정확히 <b>0</b>으로 만들되 마지막 다트는 <b>더블이나 불</b>이어야 합니다(더블 아웃). 먼저 끝내는 쪽이 이깁니다.`],
        ["버스트", "0보다 적게, 정확히 1이 남게, 또는 더블이 아닌 다트로 0을 만들면 <b>버스트</b>입니다. 그 차례의 점수는 모두 없던 것이 되고 차례가 바로 넘어갑니다."],
        ["체크아웃", "남은 점수를 끝낼 수 있는 길이 있으면 칠판 아래와 위쪽 안내에 적어 줍니다(예: T20 T20 D20)."],
        ["카운트업", `${ROUNDS}라운드 동안 세 개씩 던져 <b>합계가 많은 쪽</b>이 이깁니다. 버스트는 없습니다.`],
        ["오래 걸리면", `501에서 ${LIMIT}라운드가 지나도록 아무도 끝내지 못하면 남은 점수가 적은 쪽이 이깁니다.`],
        ["컴퓨터", `점수를 낼 때는 T20을, 끝낼 수 있을 때는 체크아웃 길을 노립니다. 난이도가 높을수록 덜 흩어집니다(${Object.values(LEVELS)
          .map((l) => l.label)
          .join(" · ")}).`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "화면 높이의 3분의 1쯤 곧게 밀어 올리면 한가운데를 노립니다. 조금 더 길게 밀면 위쪽의 20으로 갑니다.",
        "T20이 어렵다면 넓은 20 칸이나 불 둘레를 노려도 꾸준히 점수가 납니다.",
        "501 끝에서는 남은 점수가 짝수가 되게 맞춰 두고 더블을 노립니다. 32(D16)나 40(D20)이 좋은 자리입니다.",
      ),
    ),
  help: "마우스·터치: 누른 채 위로 밀었다가 놓아 던집니다<br>키보드: 방향키로 노리는 곳을 옮기고 Enter나 스페이스로 던집니다",
  sides: ["빨강", "파랑"],
  firstNote: "컴퓨터 대전에서는 내가 빨강 다트로 먼저 던집니다.",
  startWord: "던지는 선에 서기",
};
