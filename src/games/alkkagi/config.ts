import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { GO, LAY_ROW, alkkagi, goPoint, type State } from "./rules";
import { AlkkagiView, PIECE_COLORS, STONE_COLORS } from "./view";

export const alkkagiConfig: PointConfig<State> = {
  game: alkkagi,
  view: (host, quality, variant) => new AlkkagiView(host, quality, variant === "janggi" ? "janggi" : "go"),
  colors: STONE_COLORS,
  colorsOf: (variant) => (variant === "janggi" ? PIECE_COLORS : STONE_COLORS),
  sidesOf: (variant) => (variant === "janggi" ? ["초", "한"] : ["흑", "백"]),
  // The keyboard sets stones; shots are made by pulling a stone.
  keyPoints: (state) => (state.phase === "place" ? Array.from({ length: GO * GO }, (_, point) => goPoint(point)) : []),
  keyStart: (state) => (state.turn === 0 ? 13 * GO + 9 : 5 * GO + 9),
  variants: [
    { value: "go-3", label: "바둑알 3개" },
    { value: "go-5", label: "바둑알 5개" },
    { value: "go-7", label: "바둑알 7개" },
    { value: "go-10", label: "바둑알 10개" },
    { value: "janggi", label: "장기알 (기본 배치 16개)" },
  ],
  variantLabel: "알과 개수",
  tools: [{ label: "남은 알 한 줄로 놓기", point: LAY_ROW }],
  // A flick cannot be taken back.
  noUndo: true,
  // A flicked stone clacks against the others.
  contact: (sound) => sound.tap(),
  firstNote: "내가 먼저 튕깁니다. 바둑알은 그 전에 각자 자기 알을 놓습니다.",
  name: "알까기",
  english: "Alkkagi",
  number: "NO. 25 — FLICK",
  intro: `<p>손가락으로 알을 튕겨 상대 알을 판 밖으로 떨어뜨립니다.<br>바둑알은 개수와 자리를 정하고, 장기알은 장기 첫 자리에서 시작합니다.</p>`,
  meta: "2인 · 바둑알 3–10개 또는 장기알 16개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FLICK THEM OFF</span>`,
  artClass: "alkkagi-art",
  artLabel: "알까기 판 미리보기",
  tableLabel: "THE FLICKING BOARD",
  tableNote: (variant) => (variant === "janggi" ? "장기알 16개씩" : `바둑알 ${variant.split("-")[1]}개씩`),
  rulesTitle: "튕겨서 떨어뜨리세요",
  rules:
    part("기본 규칙", steps("차례마다 <b>내 알 하나</b>를 튕깁니다. <b>내가(흑·초) 먼저</b> 튕깁니다.", "튕긴 알이 다른 알을 맞히면 그 알이 밀려납니다.", "<b>판 밖으로 나간 알</b>은 잃습니다. 내가 튕긴 알이 나가도 잃습니다.", "상대 알을 모두 떨어뜨리면 이깁니다. 한 번에 두 사람의 알이 모두 없어지면 무승부입니다.")) +
    part("튕기는 법", table(["당기기", "내 알을 누른 채 <b>보내고 싶은 쪽의 반대로</b> 당깁니다. 새총처럼 당긴 반대쪽으로 나갑니다."], ["세기", "멀리 당길수록 세게 나갑니다. 노란 막대가 방향과 세기를 보여 줍니다."], ["놓기", "손을 떼면 튕겨 나갑니다. 거의 당기지 않고 놓으면 취소됩니다."], ["너무 세게 치면", "바둑알은 세기가 끝에 가까우면 <b>가끔 붕 떠서 날아갑니다</b>. 뜬 알은 다른 알을 맞히지 못하고 넘어가며, 내려앉은 곳이 판 밖이면 잃습니다. 셀수록 잘 뜹니다. 장기알은 뜨지 않습니다."])) +
    part("바둑알", table(["개수", "새 게임 설정에서 3·5·7·10개 중에 고릅니다."], ["자리 놓기", "시작할 때 각자 <b>자기 쪽 절반</b>의 선이 만나는 점에 알을 놓습니다. 가운데 빨간 줄과 그 너머에는 놓을 수 없습니다."], ["한 줄로 놓기", "남은 알을 가운데부터 두 칸 간격으로 한꺼번에 놓습니다."], ["순서", "내가 먼저 다 놓으면 상대가 놓고, 그다음 내가 먼저 튕깁니다."])) +
    part("장기알", table(["자리", "장기를 시작할 때의 자리 그대로 16개씩 놓입니다."], ["크기", "궁(楚·漢)이 가장 크고 무겁고, 차·포·마·상이 그다음, 사와 졸·병이 가장 작고 가볍습니다."], ["무게", "무거운 알은 잘 밀리지 않고, 가벼운 알을 멀리 밀어냅니다."], ["경첩", "접는 장기판 가운데의 놋쇠 경첩 두 개는 <b>장애물</b>입니다. 알이 부딪히면 튕겨 나오고, 경첩 뒤의 알은 곧장 맞힐 수 없습니다."])) +
    part("처음이라면", notes("너무 세게 튕기면 내 알도 함께 판 밖으로 나가거나, 떠서 상대 알을 넘어가 버립니다.", "상대 알의 <b>가운데</b>를 맞히면 내 알은 멈추고 상대 알이 나갑니다. 빗맞으면 둘 다 비스듬히 갑니다.", "가장자리에 선 상대 알이 가장 쉬운 표적입니다. 내 알은 가운데에 둡니다.", "한 번에 두 알을 맞히는 줄을 찾아봅니다.")),
  help: "마우스·터치: 내 알을 누른 채 뒤로 당겼다 놓습니다<br>알 놓기: 내 쪽 절반의 점을 누릅니다",
  sides: ["흑", "백"],
  startWord: "판 앞에 앉기",
};
