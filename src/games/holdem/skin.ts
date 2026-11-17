import { part, steps, notes, table } from "../../ui/guide";
import type { CardSkin } from "../cards/table-view";
import { CARD, drawBack, drawFace } from "../cards/faces";
import type { BettingConfig } from "../../ui/betting-game";
import { holdem } from "./game";
import { HOLDEM_LONG, HOLDEM_SQUARE, HOLDEM_WIDE, shapeOf } from "./layout";
import { pokerRoom } from "./room";
import { BLINDS, HANDS_PER_LEVEL, MAX_OPPONENTS, START_CHIPS, type State } from "./rules";

/** The shared deck (see `../cards/faces.ts`) on an oval table in a poker room. */
export const holdemSkin: CardSkin = {
  ...CARD,
  // Two cards a seat: they lie side by side.
  compact: true,
  secretLeft: 2,
  lines: ["텍사스 홀덤", "두 장과 공용 카드 다섯 장"],
  back: drawBack,
  face: drawFace,
  setting: pokerRoom({ wide: HOLDEM_WIDE, square: HOLDEM_SQUARE, long: HOLDEM_LONG }, shapeOf),
};
const chips = (n: number) => n.toLocaleString("ko-KR");
export const holdemConfig: BettingConfig<State> = {
  game: holdem,
  skin: holdemSkin,
  name: "텍사스 홀덤",
  english: "Texas Hold'em",
  intro: `<p>내 두 장과 가운데 공용 카드 다섯 장.<br>베팅 한도 없이 컴퓨터들과 칩을 겨루세요.</p>`,
  meta: `나 + 컴퓨터 1–${MAX_OPPONENTS}명 · 노리밋 · 시작 칩 ${chips(START_CHIPS)} · 블라인드 ${BLINDS[0][0]}/${BLINDS[0][1]}부터`,
  art: `<div class="pk-mini"><i class="bj-mini-card back"></i><i class="bj-mini-card back"></i><i class="bj-mini-card">A<b>♠</b></i><i class="bj-mini-card red">K<b>♥</b></i><i class="bj-mini-card">Q<b>♣</b></i></div><span>TWO CARDS, FIVE ON THE BOARD</span>`,
  artLabel: "텍사스 홀덤 테이블 미리보기",
  artClass: "holdem-art",
  tableLabel: "THE POKER ROOM",
  tableNote: "노리밋 텍사스 홀덤",
  dealWord: "카드 받기",
  opponents: Array.from({ length: MAX_OPPONENTS }, (_, i) => i + 1),
  words: { fold: "폴드", raise: "레이즈" },
  rulesTitle: "두 장과 공용 카드 다섯 장",
  rules: `${part(
    "기본 규칙",
    steps(
      `판마다 딜러 버튼 왼쪽의 두 사람이 스몰 블라인드와 빅 블라인드를 냅니다. 버튼은 판마다 왼쪽으로 한 자리씩 옮겨 갑니다.`,
      "모두 두 장을 엎어서 받습니다. 내 카드는 나만 봅니다.",
      "빅 블라인드 왼쪽 사람부터 베팅합니다(프리플롭).",
      "가운데에 공용 카드 세 장(플롭), 한 장(턴), 한 장(리버)이 차례로 펼쳐집니다. 펼쳐질 때마다 버튼 왼쪽 사람부터 베팅합니다.",
      "한 명만 남으면 그 사람이 판돈을 가져갑니다.",
      "끝까지 가면 내 두 장과 공용 카드 다섯 장, 일곱 장 가운데 <b>가장 좋은 다섯 장</b>으로 겨룹니다.",
      `칩을 모두 잃으면 끝나고, 컴퓨터를 모두 파산시키면 이깁니다. 블라인드는 ${HANDS_PER_LEVEL}판마다 오릅니다.`,
    ),
  )}${part(
    "베팅",
    table(
      ["체크 / 콜", "앞사람이 건 만큼 맞춥니다. 걸린 것이 없으면 그냥 넘깁니다."],
      ["베팅 / 레이즈", "더 겁니다. 처음 거는 것은 빅 블라인드 이상, 올리는 것은 바로 앞에서 올린 만큼 이상입니다. 한도는 없습니다."],
      ["올인", "가진 칩을 모두 겁니다. 낸 만큼만 겨루고, 나머지는 따로(사이드 팟) 겨룹니다."],
      ["폴드", "포기합니다. 카드는 엎어 둡니다."],
    ),
  )}${part(
    "테이블",
    table(
      ["딜러 버튼", "DEALER라고 쓰인 흰 원판. 버튼 자리는 베팅을 가장 늦게 합니다."],
      ["블라인드", `판을 시작할 때 미리 내는 칩. 스몰은 ${BLINDS[0][0]}, 빅은 ${BLINDS[0][1]}에서 시작합니다. 둘이 겨룰 때는 버튼이 스몰 블라인드입니다.`],
      ["공용 카드", "가운데에 펼쳐지는 다섯 장. 모두가 함께 씁니다."],
    ),
  )}<h3>족보 (높은 순)</h3><dl class="piece-moves"><dt>로열 스트레이트 플러시</dt><dd>같은 무늬의 10·J·Q·K·A.</dd><dt>스트레이트 플러시</dt><dd>같은 무늬로 숫자가 이어지는 다섯 장.</dd><dt>포카드</dt><dd>같은 숫자 네 장.</dd><dt>풀하우스</dt><dd>같은 숫자 세 장 + 같은 숫자 두 장.</dd><dt>플러시</dt><dd>같은 무늬 다섯 장.</dd><dt>스트레이트</dt><dd>숫자가 이어지는 다섯 장. A-2-3-4-5가 가장 낮습니다.</dd><dt>트리플</dt><dd>같은 숫자 세 장.</dd><dt>투페어</dt><dd>같은 숫자 두 장이 두 쌍.</dd><dt>원페어</dt><dd>같은 숫자 두 장.</dd><dt>하이카드</dt><dd>아무것도 없을 때. 가장 높은 카드로 겨룹니다.</dd></dl>${part(
    "같은 족보일 때",
    notes(
      "족보를 이루는 숫자가 높은 쪽이 이깁니다. A가 가장 높습니다.",
      "그것도 같으면 다섯 장 안의 남은 카드(키커)로 겨룹니다. 여섯 번째 카드는 세지 않습니다.",
      "무늬에는 순위가 없습니다. 완전히 같으면 판돈을 똑같이 나눕니다.",
    ),
  )}${part(
    "처음이라면",
    notes(
      "처음 두 장이 좋을 때(같은 숫자 두 장, 높은 카드 두 장)만 들어가도 충분합니다.",
      "공용 카드가 펼쳐지면 내 카드와 맞는지 보세요. 아무것도 맞지 않으면 체크하거나 폴드합니다.",
      "콜할 칩이 판돈에 비해 작으면 더 약한 패로도 따라갈 만합니다.",
    ),
  )}`,
};
